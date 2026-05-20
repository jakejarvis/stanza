import fs from "node:fs";

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(fs.readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, value: unknown): void {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/**
 * Deep-merge an object into the JSON at `path`. Arrays are replaced, not merged.
 * Returns the dot-paths that were created or changed (for region claiming).
 */
export function mergeJson(path: string, patch: Record<string, unknown>): string[] {
  const original = readJson<Record<string, unknown>>(path);
  const touched: string[] = [];
  const merged = mergeRecurse(original, patch, "", touched);
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
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object" &&
      out[k] !== null &&
      !Array.isArray(out[k])
    ) {
      out[k] = mergeRecurse(
        out[k] as Record<string, unknown>,
        v as Record<string, unknown>,
        path,
        touched,
      );
    } else {
      if (out[k] !== v) touched.push(path);
      out[k] = v;
    }
  }
  return out;
}

export function setJsonPath(file: string, dotPath: string, value: unknown): void {
  const root = readJson<Record<string, unknown>>(file);
  setPath(root, dotPath, value);
  writeJson(file, root);
}

export function unsetJsonPath(file: string, dotPath: string): void {
  const root = readJson<Record<string, unknown>>(file);
  unsetPath(root, dotPath);
  writeJson(file, root);
}

function setPath(root: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split(".");
  // parts is non-empty by construction (dotPath is non-empty caller contract)
  const last = parts.pop() as string;
  let node: Record<string, unknown> = root;
  for (const p of parts) {
    if (typeof node[p] !== "object" || node[p] === null) node[p] = {};
    node = node[p] as Record<string, unknown>;
  }
  node[last] = value;
}

function unsetPath(root: Record<string, unknown>, dotPath: string): void {
  const parts = dotPath.split(".");
  const last = parts.pop() as string;
  let node: Record<string, unknown> = root;
  for (const p of parts) {
    if (typeof node[p] !== "object" || node[p] === null) return;
    node = node[p] as Record<string, unknown>;
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
