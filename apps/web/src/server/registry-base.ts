/**
 * Reads registry data from the public dir on disk — the same JSON the deployed
 * site serves at `/registry/`. Done via fs instead of fetching ourselves
 * because prod SSR loopback connections get refused, and the file is sitting
 * right next to the bundle anyway.
 */
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function loadRegistryFile<T>(relativePath: string): Promise<T> {
  const full = path.join(publicRegistryDir(), relativePath);
  const buf = await fs.readFile(full, "utf8");
  return JSON.parse(buf) as T;
}

/**
 * Resolve `apps/web/public/registry/` relative to this module.
 *
 *  - In dev: `import.meta.url` is `src/server/registry-base.ts` — walk to
 *    `apps/web/` and into `public/registry/`.
 *  - In the prod Nitro bundle: this module is inlined into a chunk under
 *    `.output/server/`. The public dir is sibling: `.output/public/registry/`.
 *
 * We try both. The first that exists wins. Cached.
 */
let resolved: string | undefined;
function publicRegistryDir(): string {
  if (resolved) return resolved;
  const here = fileURLToPath(import.meta.url);
  const candidates = [
    path.resolve(path.dirname(here), "../../public/registry"),
    path.resolve(path.dirname(here), "../public/registry"),
    path.resolve(process.cwd(), "public/registry"),
    path.resolve(process.cwd(), ".output/public/registry"),
  ];
  for (const c of candidates) {
    if (existsSync(path.join(c, "index.json"))) {
      resolved = c;
      return c;
    }
  }
  resolved = candidates[0]!;
  return resolved;
}
