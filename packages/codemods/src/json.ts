import fs from "node:fs";

import { applyEdits, modify, parse, type ParseError, printParseErrorCode } from "jsonc-parser";

/** Narrow an unknown JSON value to a plain object (excludes arrays and null). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const FORMAT = { formattingOptions: { tabSize: 2, insertSpaces: true } } as const;

function parseJsonc(text: string, file: string): unknown {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const first = errors[0]!;
    throw new Error(
      `${file}: invalid JSON/JSONC (${printParseErrorCode(first.error)} at offset ${first.offset}).`,
    );
  }
  return value;
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : s + "\n";
}

function readText(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "{}";
}

/**
 * Apply one surgical edit at a structured path. Preserves comments,
 * trailing commas, indentation, and key ordering outside the edit point —
 * the whole reason we use jsonc-parser instead of round-tripping through
 * JSON.parse/stringify.
 */
function modifyAtPath(file: string, path: (string | number)[], value: unknown): void {
  const text = readText(file);
  let edits;
  try {
    edits = modify(text, path, value, FORMAT);
  } catch (err) {
    // jsonc-parser throws "Can not delete in empty document" when asked to
    // unset a path whose parent doesn't exist. That's a no-op for us.
    if (value === undefined && err instanceof Error && /Can not delete/.test(err.message)) {
      return;
    }
    throw err;
  }
  if (edits.length === 0) return;
  fs.writeFileSync(file, ensureTrailingNewline(applyEdits(text, edits)), "utf8");
}

export function readJson(file: string): unknown {
  return parseJsonc(fs.readFileSync(file, "utf8"), file);
}

/** Read a JSON file expected to hold an object, falling back to `{}` otherwise. */
function readRecord(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const value = readJson(file);
  return isRecord(value) ? value : {};
}

/**
 * Overwrite a JSON file end-to-end. Loses any existing comments/formatting,
 * so prefer `setJsonPath` / `addPackageDependency` for in-place updates.
 */
export function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/**
 * Deep-merge `patch` into the JSON at `file`. Arrays replace (not merge).
 * Returns the dot-paths that were created or changed (for region claiming).
 *
 * Walks the patch tree and emits one surgical edit per leaf change, so
 * unchanged keys and any comments/trailing commas in the file survive.
 *
 * Caveat: dot-paths in the return value (and the path the edits target) are
 * split on `.` — a key name like `"lodash.merge"` would be addressed as two
 * segments. Callers that pass such keys should use `setJsonPath` with a
 * dot-free leaf, or route through `addPackageDependency` (which uses a
 * structured path internally).
 */
export function mergeJson(file: string, patch: Record<string, unknown>): string[] {
  const existing = readRecord(file);
  const touched: string[] = [];

  const visit = (
    target: Record<string, unknown>,
    source: Record<string, unknown>,
    prefix: string,
  ): void => {
    for (const [k, v] of Object.entries(source)) {
      const dotPath = prefix ? `${prefix}.${k}` : k;
      const here = target[k];
      if (isRecord(v) && isRecord(here)) {
        visit(here, v, dotPath);
        continue;
      }
      if (here !== v) {
        touched.push(dotPath);
        modifyAtPath(file, dotPath.split("."), v);
      }
    }
  };
  visit(existing, patch, "");
  return touched;
}

export function setJsonPath(file: string, dotPath: string, value: unknown): void {
  modifyAtPath(file, dotPath.split("."), value);
}

export function unsetJsonPath(file: string, dotPath: string): void {
  if (!fs.existsSync(file)) return;
  modifyAtPath(file, dotPath.split("."), undefined);
}

/**
 * Structured-path variants for callers whose keys may contain `.` (e.g.
 * tsconfig `paths` aliases like `"@acme/ui.foo"`). The dot-path API would
 * mis-split those into multiple segments.
 */
export function setJsonPathSegments(
  file: string,
  segments: (string | number)[],
  value: unknown,
): void {
  modifyAtPath(file, segments, value);
}

export function unsetJsonPathSegments(file: string, segments: (string | number)[]): void {
  if (!fs.existsSync(file)) return;
  modifyAtPath(file, segments, undefined);
}

export function addPackageDependency(
  packageJsonPath: string,
  name: string,
  range: string,
  options: { dev?: boolean } = {},
): void {
  const key = options.dev ? "devDependencies" : "dependencies";
  // Structured path so dep names containing `.` (e.g. `lodash.merge`) stay
  // a single segment instead of being interpreted as nested objects.
  modifyAtPath(packageJsonPath, [key, name], range);
}

export function removePackageDependency(packageJsonPath: string, name: string): void {
  if (!fs.existsSync(packageJsonPath)) return;
  modifyAtPath(packageJsonPath, ["dependencies", name], undefined);
  modifyAtPath(packageJsonPath, ["devDependencies", name], undefined);
}

export function addPackageScript(packageJsonPath: string, name: string, command: string): void {
  modifyAtPath(packageJsonPath, ["scripts", name], command);
}
