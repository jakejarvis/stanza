#!/usr/bin/env bun
/**
 * Static registry build. Scans `registry/modules/*`, imports each module's
 * default export, writes:
 *   - dist/registry/index.json           — registry index (slot/module summaries)
 *   - dist/registry/modules/<slot>-<id>.json — per-module full manifests
 *
 * The output directory is what gets uploaded to the CDN (Vercel) and what
 * the CLI's HTTP loader hits at runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Logo, Module, RegistryIndex } from "@stanza/registry";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(here);
const modulesDir = path.join(repoRoot, "registry", "modules");
const outDir = path.join(repoRoot, "dist", "registry");

await main();

async function main() {
  fs.mkdirSync(path.join(outDir, "modules"), { recursive: true });

  const dirs = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const summaries = [];
  for (const dir of dirs) {
    const entry = path.join(modulesDir, dir, "module.ts");
    const mod = ((await import(entry)) as { default: Module }).default;
    if (!mod) throw new Error(`Module ${dir} has no default export.`);

    // Inline each template's file contents. The per-module JSON is the
    // payload the CLI fetches from the CDN, so it has to be self-contained —
    // no follow-up requests to retrieve template files. Local dev still works
    // because the runner falls back to disk when `content` is absent.
    const templatesDir = path.join(modulesDir, dir, "templates");
    const logo = readLogo(path.join(modulesDir, dir));
    const codemodBundle = await bundleCodemods(path.join(modulesDir, dir));
    const inlined: Module = {
      ...mod,
      ...(logo ? { logo } : {}),
      ...(codemodBundle ? { codemodBundle } : {}),
      adapters: mod.adapters.map((adapter) => ({
        ...adapter,
        templates: adapter.templates?.map((tpl) => ({
          ...tpl,
          content: fs.readFileSync(path.join(templatesDir, tpl.src), "utf8"),
        })),
      })),
    };

    fs.writeFileSync(
      path.join(outDir, "modules", `${mod.slot}-${mod.id}.json`),
      JSON.stringify(inlined, null, 2),
    );

    // The index keeps a lightweight summary — no `content`, no per-adapter
    // payloads — but it DOES carry top-level metadata like `logo` so the
    // wizard / web builder can render module cards without fetching the
    // full per-module JSON.
    summaries.push({
      ...inlined,
      adapters: inlined.adapters.map((a) => ({ key: a.key, match: a.match })),
    });
  }

  const index: RegistryIndex = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    slots: [
      { id: "framework", label: "Framework", description: "Web/native app framework." },
      { id: "styling", label: "Styling", description: "CSS / styling system." },
      { id: "db", label: "Database", description: "Database engine." },
      { id: "orm", label: "ORM", description: "Database query layer." },
      { id: "auth", label: "Auth", description: "Authentication provider." },
    ],
    modules: summaries,
  };

  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2));

  console.log(`Wrote ${summaries.length} modules to ${outDir}`);
}

/**
 * Convention: a module ships a logo by dropping either `logo.svg` (a single
 * theme-agnostic SVG) or `logo-light.svg` + `logo-dark.svg` (a theme pair)
 * in its directory. We read whichever is present and return the inlined
 * markup; if neither exists the module just renders without one.
 */
function readLogo(moduleDir: string): Logo | undefined {
  const light = path.join(moduleDir, "logo-light.svg");
  const dark = path.join(moduleDir, "logo-dark.svg");
  if (fs.existsSync(light) && fs.existsSync(dark)) {
    return {
      light: fs.readFileSync(light, "utf8"),
      dark: fs.readFileSync(dark, "utf8"),
    };
  }
  const single = path.join(moduleDir, "logo.svg");
  if (fs.existsSync(single)) return fs.readFileSync(single, "utf8");
  return undefined;
}

/**
 * If a module ships imperative codemods (`codemods/index.ts`), bundle them
 * into a self-contained ESM string and embed in the registry JSON. We mark
 * the runtime helpers (`@stanza/codemods`, `ts-morph`, Node built-ins) as
 * external — the CLI provides them at install time. Local dev (FS-loaded
 * modules) can still ignore this and import the source directly off disk.
 */
async function bundleCodemods(moduleDir: string): Promise<string | undefined> {
  const entry = path.join(moduleDir, "codemods", "index.ts");
  if (!fs.existsSync(entry)) return undefined;

  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    external: [
      "@stanza/codemods",
      "@stanza/registry",
      "ts-morph",
      "node:*",
      "fs",
      "path",
      "os",
      "url",
    ],
    minify: false,
  });

  if (!result.success) {
    const log = result.logs.map((l: { message?: string }) => l.message ?? String(l)).join("\n");
    throw new Error(`Failed to bundle codemods at ${entry}:\n${log}`);
  }

  const out = result.outputs[0];
  if (!out) throw new Error(`Bundler produced no output for ${entry}`);
  return await out.text();
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate repo root from " + start);
}
