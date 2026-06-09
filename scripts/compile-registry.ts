/**
 * Static registry build. Scans `registry/modules/*`, imports each module's
 * default export, writes:
 *   - <out>/index.json              — the main file (per-module
 *                                               metadata, each carrying `path`)
 *   - <out>/<category>-<id>.json    — per-module full manifests
 *
 * Output is flat (no `modules/` subdir) so it maps 1:1 onto the Blob store and
 * the path-transparent `stanza.tools/registry/<file>.json` rewrites. The output
 * base defaults to `<repoRoot>/dist`. Pass a positional arg to redirect — e.g.
 * the web app's `compile-registry` task points it at `apps/web/.registry`.
 *
 * A standalone build tool (not part of any package): the web's compile-registry
 * task, the Blob upload in CI, and the CLI test harness all invoke it via
 * `jiti scripts/compile-registry.ts [outDir]`. `compileRegistry()` is also
 * exported for any in-process caller.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CATEGORIES, type Logo, type Module, type RegistryIndex } from "@withstanza/schema";
import { optimize } from "svgo";

/** One compiled module: its source dir basename, output slug, and version. */
export type CompiledModule = { dir: string; slug: string; version: string };

/**
 * Build the static registry into `<outDir>`. `modulesDir` defaults to the
 * repo's `registry/modules`; tests can point it elsewhere. Returns the final
 * module count plus a `dir → slug/version` mapping — the source dir name is a
 * convention (`<category>-<id>`), not a contract, so callers correlating
 * source dirs with compiled output (e.g. the version-pin guard) must go
 * through this mapping rather than infer filenames.
 */
export async function compileRegistry(opts: {
  modulesDir?: string;
  outDir: string;
}): Promise<{ count: number; modules: CompiledModule[] }> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = findRepoRoot(here);
  const modulesDir = opts.modulesDir ?? path.join(repoRoot, "registry", "modules");

  // Clear stale `*.json` (including a previous `index.json`) so a renamed or
  // removed module's file doesn't linger and ghost-serve. Leaves any other dir
  // contents alone; the out dir is recreated if absent.
  fs.mkdirSync(opts.outDir, { recursive: true });
  for (const f of fs.readdirSync(opts.outDir)) {
    if (f.endsWith(".json")) fs.rmSync(path.join(opts.outDir, f));
  }

  const dirs = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const metadata = [];
  const compiledModules: CompiledModule[] = [];
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
    // The module's `package.json` version is the single source of truth — it's
    // what `stanza add` pins into `stanza.json` and the key the Blob archive
    // pins each immutable per-module file under. `module.ts`'s own `version`
    // is vestigial (the two had already drifted), so we override it here.
    const version = readPackageVersion(path.join(modulesDir, dir));
    const inlined: Module = {
      ...mod,
      version,
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

    // Per-module files live flat at `<category>-<id>.json`; the index records
    // each one's relative `path` so the loader never has to infer a filename.
    // (The physical layout is the build's choice — the contract is the explicit
    // `path`, resolved relative to the index URL.)
    const modulePath = `${mod.category}-${mod.id}.json`;
    fs.writeFileSync(path.join(opts.outDir, modulePath), JSON.stringify(inlined, null, 2));
    compiledModules.push({ dir, slug: `${mod.category}-${mod.id}`, version });

    // The index keeps lightweight metadata — no template `content`, no
    // per-adapter payloads — but it DOES carry top-level fields like `logo`
    // so the wizard / web builder can render module cards without fetching
    // the full per-module JSON, plus the `path` the loader resolves.
    metadata.push({
      ...inlined,
      adapters: inlined.adapters.map((a) => ({ key: a.key, match: a.match })),
      path: modulePath,
    });
  }

  const index: RegistryIndex = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 2,
    categories: [...CATEGORIES],
    modules: metadata,
  };

  fs.writeFileSync(path.join(opts.outDir, "index.json"), JSON.stringify(index, null, 2));

  return { count: metadata.length, modules: compiledModules };
}

// Direct invocation: `jiti scripts/compile-registry.ts [outDir]`. Skipped when
// imported (e.g. by test harnesses), so importing has no side effect.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  const outDir = process.argv[2] ?? path.join(repoRoot, "dist");
  const { count } = await compileRegistry({ outDir });
  console.log(`Wrote ${count} modules to ${outDir}`);
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
      // Logos render via dangerouslySetInnerHTML: `removeScripts` drops
      // `<script>` elements, every spec-defined event attribute, and
      // `javascript:` hrefs; the `removeAttrs` pass additionally catches
      // nonstandard `on*` attributes the spec groups don't cover.
      "removeScripts",
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

/**
 * Each module dir is a private workspace package; its `package.json` version is
 * the source of truth for the module's published version (pinned into
 * `stanza.json` and used as the Blob archive key). Throws if missing so a new
 * module can't ship without a version.
 */
function readPackageVersion(moduleDir: string): string {
  const file = path.join(moduleDir, "package.json");
  const pkg: { version?: unknown } = JSON.parse(fs.readFileSync(file, "utf8"));
  if (typeof pkg.version !== "string" || pkg.version.length === 0) {
    throw new Error(`Module ${moduleDir} has no \`version\` in package.json.`);
  }
  return pkg.version;
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate repo root from " + start);
}
