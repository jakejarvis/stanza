import fs from "node:fs";

/** Narrow an unknown JSON value to a plain object (excludes arrays and null). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readJson(path: string): unknown {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

/** Read a JSON file expected to hold an object, falling back to `{}` otherwise. */
function readRecord(path: string): Record<string, unknown> {
  const value = readJson(path);
  return isRecord(value) ? value : {};
}

export function writeJson(path: string, value: unknown): void {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/**
 * Deep-merge an object into the JSON at `path`. Arrays are replaced, not merged.
 * Returns the dot-paths that were created or changed (for region claiming).
 */
export function mergeJson(path: string, patch: Record<string, unknown>): string[] {
  const touched: string[] = [];
  const merged = mergeRecurse(readRecord(path), patch, "", touched);
  writeJson(path, merged);
  return touched;
}

function mergeRecurse(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  prefix: string,
  touched: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const existing = out[k];
    if (isRecord(v) && isRecord(existing)) {
      out[k] = mergeRecurse(existing, v, path, touched);
    } else {
      if (out[k] !== v) touched.push(path);
      out[k] = v;
    }
  }
  return out;
}

export function setJsonPath(file: string, dotPath: string, value: unknown): void {
  const root = readRecord(file);
  setPath(root, dotPath, value);
  writeJson(file, root);
}

export function unsetJsonPath(file: string, dotPath: string): void {
  const root = readRecord(file);
  unsetPath(root, dotPath);
  writeJson(file, root);
}

function setPath(root: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split(".");
  const last = parts.pop();
  // dotPath is non-empty by caller contract, so `parts` was non-empty.
  if (last === undefined) return;
  let node = root;
  for (const p of parts) {
    const next = node[p];
    if (isRecord(next)) {
      node = next;
    } else {
      const created: Record<string, unknown> = {};
      node[p] = created;
      node = created;
    }
  }
  node[last] = value;
}

function unsetPath(root: Record<string, unknown>, dotPath: string): void {
  const parts = dotPath.split(".");
  const last = parts.pop();
  if (last === undefined) return;
  let node = root;
  for (const p of parts) {
    const next = node[p];
    if (!isRecord(next)) return;
    node = next;
  }
  delete node[last];
}

export function addPackageDependency(
  packageJsonPath: string,
  name: string,
  range: string,
  options: { dev?: boolean } = {},
): void {
  const key = options.dev ? "devDependencies" : "dependencies";
  setJsonPath(packageJsonPath, `${key}.${name}`, range);
}

export function removePackageDependency(packageJsonPath: string, name: string): void {
  unsetJsonPath(packageJsonPath, `dependencies.${name}`);
  unsetJsonPath(packageJsonPath, `devDependencies.${name}`);
}

export function addPackageScript(packageJsonPath: string, name: string, command: string): void {
  setJsonPath(packageJsonPath, `scripts.${name}`, command);
}
