import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Walk `content/docs/**/*.{md,mdx}` and derive the URL path Fumadocs would
// generate, without importing the runtime loader (which depends on the
// generated `.source/` collections produced by the mdx plugin in this very
// build). `foo/bar.mdx` → `/docs/foo/bar`; `index.mdx` → `/docs`;
// `foo/index.mdx` → `/docs/foo`.
function listDocsPaths(): string[] {
  const docsDir = resolve(appRoot, "content/docs");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
        const rel = relative(docsDir, full).replace(/\.mdx?$/, "");
        const parts = rel.split(sep).filter(Boolean);
        if (parts.at(-1) === "index") parts.pop();
        out.push(parts.length === 0 ? "/docs" : `/docs/${parts.join("/")}`);
      }
    }
  };
  walk(docsDir);
  return out.toSorted();
}

// Read the registry from disk (populated by the `prebuild` script before vite
// runs). We avoid `@/server/registry-base.server` because it goes through
// Nitro's `useStorage`, which only exists at request time. Returns both the
// category landing pages (`/registry/<cat>`) and per-module detail pages
// (`/registry/<cat>/<id>`) so every public registry URL prerenders.
function listRegistryPaths(): string[] {
  const registryPath = resolve(appRoot, "public/registry/index.json");
  let raw: string;
  try {
    raw = readFileSync(registryPath, "utf8");
  } catch (error) {
    throw new Error(
      `Prerender enumeration failed: ${registryPath} is missing. ` +
        `Run \`pnpm --filter @stanza/web prebuild\` (or \`vp run @stanza/web#build\`) first.`,
      { cause: error },
    );
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const index = JSON.parse(raw) as {
    categories: Array<{ id: string }>;
    modules: Array<{ category: string; id: string }>;
  };
  const categoryPaths = index.categories.map((c) => `/registry/${c.id}`);
  const modulePaths = index.modules.map((m) => `/registry/${m.category}/${m.id}`);
  return [...categoryPaths, ...modulePaths].toSorted((a, b) => a.localeCompare(b));
}

export function listPrerenderPages() {
  const docs = listDocsPaths();
  const registry = listRegistryPaths();
  const paths = [
    "/",
    ...docs,
    ...docs.map((p) => `${p}.md`),
    "/docs/llms.txt",
    "/docs/llms-full.txt",
    ...registry,
    "/stats",
  ];
  return paths.map((path) => ({ path, prerender: { enabled: true } }));
}
