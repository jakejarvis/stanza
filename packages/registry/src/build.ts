/**
 * Static registry build. Scans `registry/modules/*`, imports each module's
 * default export, writes:
 *   - <out>/registry/index.json           — registry index (per-module metadata)
 *   - <out>/registry/modules/<slot>-<id>.json — per-module full manifests
 *   - <out>/schema.json                   — JSON Schema for stanza.json (served at the web root)
 *
 * The output base defaults to `<repoRoot>/dist`. Pass a positional arg to
 * redirect — e.g. the web app's prebuild points it at `apps/web/public/` so
 * the registry lands directly under `public/registry/`.
 *
 * Invoked via `jiti packages/registry/src/build.ts [outBase]`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { optimize } from "svgo";

import { manifestJsonSchema } from "./manifest";
import { CATEGORIES, type Logo, type Module, type RegistryIndex } from "./module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(here);
const modulesDir = path.join(repoRoot, "registry", "modules");
const outBase = path.resolve(process.argv[2] ?? path.join(repoRoot, "dist"));
const registryDir = path.join(outBase, "registry");

await main();

async function main() {
  // Wipe + recreate so a renamed module's stale JSON doesn't linger and
  // ghost-serve from the CDN.
  const modulesOut = path.join(registryDir, "modules");
  fs.rmSync(modulesOut, { recursive: true, force: true });
  fs.mkdirSync(modulesOut, { recursive: true });

  const dirs = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const metadata = [];
  for (const dir of dirs) {
    const entry = path.join(modulesDir, dir, "module.ts");
    const imported: { default: Module } = await import(entry);
    const mod = imported.default;
    if (!mod) throw new Error(`Module ${dir} has no default export.`);

    // Inline each template's file contents. The per-module JSON is the
    // payload the CLI fetches from the CDN, so it has to be self-contained —
    // no follow-up requests to retrieve template files. Local dev still works
    // because the runner falls back to disk when `content` is absent.
    const templatesDir = path.join(modulesDir, dir, "templates");
    const logo = readLogo(path.join(modulesDir, dir), dir);
    const readme = readReadme(path.join(modulesDir, dir));
    const inlined: Module = {
      ...mod,
      ...(logo ? { logo } : {}),
      ...(readme ? { readme } : {}),
      adapters: mod.adapters.map((adapter) => ({
        ...adapter,
        templates: adapter.templates?.map((tpl) => ({
          ...tpl,
          content: fs.readFileSync(path.join(templatesDir, tpl.src), "utf8"),
        })),
      })),
    };

    // Dirs/files are keyed by `<category>-<id>` (e.g. testing-vitest). The
    // CLI's HTTP loader builds the same filename from the category it's asked for.
    fs.writeFileSync(
      path.join(registryDir, "modules", `${mod.category}-${mod.id}.json`),
      JSON.stringify(inlined, null, 2),
    );

    // The index keeps lightweight metadata — no template `content`, no
    // per-adapter payloads — but it DOES carry top-level fields like `logo`
    // so the wizard / web builder can render module cards without fetching
    // the full per-module JSON.
    metadata.push({
      ...inlined,
      adapters: inlined.adapters.map((a) => ({ key: a.key, match: a.match })),
    });
  }

  const index: RegistryIndex = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    categories: [...CATEGORIES],
    modules: metadata,
  };

  fs.writeFileSync(path.join(registryDir, "index.json"), JSON.stringify(index, null, 2));

  // The stanza.json JSON Schema is served at the web root (not under /registry/),
  // so it lands at <outBase>/schema.json rather than <outBase>/registry/schema.json.
  fs.writeFileSync(
    path.join(outBase, "schema.json"),
    JSON.stringify(manifestJsonSchema(), null, 2),
  );

  console.log(`Wrote ${metadata.length} modules to ${outBase}`);
}

/**
 * Convention: a module ships a logo by dropping either `logo.svg` (a single
 * theme-agnostic SVG) or `logo-light.svg` + `logo-dark.svg` (a theme pair)
 * in its directory. We read whichever is present and return the inlined
 * markup; if neither exists the module just renders without one.
 *
 * Each SVG is optimized + namespaced through SVGO. The `prefixIds` plugin
 * scopes every `id` (and every `url(#…)` / `href="#…"` / `xlink:href="#…"`
 * reference) by the module slug, so when many logos share the document
 * (slot grids, search results), gradients and clip-paths from one logo
 * never bleed into another via collisions like `id="a"`.
 */
function readLogo(moduleDir: string, slug: string): Logo | undefined {
  const light = path.join(moduleDir, "logo-light.svg");
  const dark = path.join(moduleDir, "logo-dark.svg");
  if (fs.existsSync(light) && fs.existsSync(dark)) {
    return {
      light: optimizeLogo(fs.readFileSync(light, "utf8"), `${slug}-light`),
      dark: optimizeLogo(fs.readFileSync(dark, "utf8"), `${slug}-dark`),
    };
  }
  const single = path.join(moduleDir, "logo.svg");
  if (fs.existsSync(single)) return optimizeLogo(fs.readFileSync(single, "utf8"), slug);
  return undefined;
}

function optimizeLogo(svg: string, prefix: string): string {
  return optimize(svg, {
    multipass: true,
    plugins: [
      "preset-default",
      { name: "prefixIds", params: { prefix, delim: "-" } },
      // Strip every `on*` event handler so we can render via dangerouslySetInnerHTML
      // without smuggling JS through a hostile (third-party) logo.
      { name: "removeAttrs", params: { attrs: "on[a-zA-Z]+" } },
    ],
  }).data;
}

/**
 * Convention: a module ships its README contribution by dropping `readme.md`
 * in its directory. We inline the contents into the module manifest so HTTP-
 * loaded modules stay self-contained. Absent → undefined; `synthesizeReadme`
 * falls back to the module's `description` for those.
 */
function readReadme(moduleDir: string): string | undefined {
  const file = path.join(moduleDir, "readme.md");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  return undefined;
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate repo root from " + start);
}
