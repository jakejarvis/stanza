import fs from "node:fs";
import path from "node:path";

import { assertSafeRelativePath } from "@withstanza/utils";

import {
  type Codemod,
  readJson,
  setJsonPath,
  setJsonPathSegments,
  unsetJsonPath,
  unsetJsonPathSegments,
} from "../index";

/**
 * Merge entries into a `tsconfig.json`'s `compilerOptions.paths` map.
 * Sets `baseUrl: "."` when missing (TypeScript requires it for relative
 * `paths` to resolve).
 *
 * Used by UI modules to add `@<name>/ui/*` aliases so the IDE resolves
 * subpath imports back into the package's `./src/*` even though the runtime
 * `exports` map already points there — keeps go-to-definition snappy in
 * mixed pnpm-isolated workspaces.
 *
 * Idempotent: existing path entries are left alone (same key + same value
 * is a no-op; same key + different value throws to avoid silent shadowing).
 */
export type SetTsconfigPathsArgs = {
  /** Path to the tsconfig file, relative to `base`. Defaults to `"tsconfig.json"`. */
  file?: string;
  /**
   * Where `file` resolves against:
   *  - `"repo"`: `ctx.projectRoot`
   *  - `"app"` (default): `ctx.appRoot`
   *  - `"package:<dir>"`: `<projectRoot>/packages/<dir>/`
   */
  base?: "app" | "repo" | `package:${string}`;
  /**
   * Path aliases to add under `compilerOptions.paths`. Each value is a list
   * of target patterns, matching TypeScript's native shape.
   */
  paths: Record<string, string[]>;
  /**
   * Region key used to track ownership. Defaults to
   * `tsconfig.paths.<comma-joined-keys>`.
   */
  regionKey?: string;
};

const setTsconfigPaths: Codemod<SetTsconfigPathsArgs> = {
  id: "set-tsconfig-paths",
  description: "Merge entries into a tsconfig's compilerOptions.paths (idempotent).",

  apply(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    if (!fs.existsSync(abs)) {
      throw new Error(
        `set-tsconfig-paths: ${rel} not found. ` +
          `Create it via the framework module's template before running this codemod.`,
      );
    }

    const root = readRoot(abs);
    const compilerOptions = isRecord(root.compilerOptions) ? root.compilerOptions : {};
    const existing = isRecord(compilerOptions.paths) ? compilerOptions.paths : {};

    // `extends` chains a parent tsconfig — adding `paths` at the child level
    // *replaces* the inherited map, silently dropping any aliases the parent
    // declared. Refuse and ask the user to add the alias to the right level.
    if (root.extends !== undefined) {
      throw new Error(
        `set-tsconfig-paths: ${rel} has an \`extends\` clause; adding paths here ` +
          `would override the inherited map. Add ${Object.keys(args.paths).join(", ")} ` +
          `to the extended tsconfig manually, or remove \`extends\`.`,
      );
    }

    // Conflict check: same key, different value → throw so the user resolves.
    for (const [key, val] of Object.entries(args.paths)) {
      const prior = existing[key];
      if (prior !== undefined && !arraysEqual(toArray(prior), val)) {
        throw new Error(
          `set-tsconfig-paths: ${rel} already maps "${key}" to a different target. ` +
            `Reconcile manually before re-running.`,
        );
      }
    }

    const allPresent = Object.entries(args.paths).every(
      ([k, v]) => existing[k] !== undefined && arraysEqual(toArray(existing[k]), v),
    );
    // Claim before writing: the runner snapshots the file on claim, and the
    // snapshot must capture the pre-write bytes for rollback to restore them.
    ctx.claimRegion(rel, regionKeyFor(args));
    if (allPresent && compilerOptions.baseUrl !== undefined) {
      return { touchedFiles: [] };
    }

    if (compilerOptions.baseUrl === undefined) {
      setJsonPath(abs, "compilerOptions.baseUrl", ".");
    }
    for (const [key, val] of Object.entries(args.paths)) {
      setJsonPathSegments(abs, ["compilerOptions", "paths", key], val);
    }
    return { touchedFiles: [rel] };
  },

  revert(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    if (!fs.existsSync(abs)) {
      ctx.releaseRegion(rel, regionKeyFor(args));
      return { touchedFiles: [] };
    }

    const root = readRoot(abs);
    const compilerOptions = isRecord(root.compilerOptions) ? root.compilerOptions : {};
    const paths = isRecord(compilerOptions.paths) ? compilerOptions.paths : {};
    let changed = false;
    for (const [key, val] of Object.entries(args.paths)) {
      if (paths[key] !== undefined && arraysEqual(toArray(paths[key]), val)) {
        unsetJsonPathSegments(abs, ["compilerOptions", "paths", key]);
        changed = true;
      }
    }
    if (changed) {
      // If the paths map ends up empty after removal, drop it entirely.
      const after = readRoot(abs);
      const afterCo = isRecord(after.compilerOptions) ? after.compilerOptions : {};
      if (isRecord(afterCo.paths) && Object.keys(afterCo.paths).length === 0) {
        unsetJsonPath(abs, "compilerOptions.paths");
      }
    }
    ctx.releaseRegion(rel, regionKeyFor(args));
    return { touchedFiles: changed ? [rel] : [] };
  },
};

function readRoot(file: string): Record<string, unknown> {
  const v = readJson(file);
  return isRecord(v) ? v : {};
}

function resolveFilePath(
  ctx: { projectRoot: string; appRoot: string },
  args: SetTsconfigPathsArgs,
): string {
  const file = args.file ?? "tsconfig.json";
  assertSafeRelativePath(file, "set-tsconfig-paths: args.file");
  const base = args.base ?? "app";
  if (base.startsWith("package:")) {
    const dir = base.slice("package:".length);
    assertSafeRelativePath(dir, "set-tsconfig-paths: args.base package dir");
    return path.join(ctx.projectRoot, "packages", dir, file);
  }
  return path.join(base === "repo" ? ctx.projectRoot : ctx.appRoot, file);
}

function regionKeyFor(args: SetTsconfigPathsArgs): string {
  if (args.regionKey) return args.regionKey;
  return `tsconfig.paths.${Object.keys(args.paths).join(",")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export default setTsconfigPaths;
