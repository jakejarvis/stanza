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

import type { Module, RegistryIndex } from "@stanza/registry";

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
    const inlined: Module = {
      ...mod,
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
    // payloads. The wizard/web builder uses this for filtering; the full
    // module JSON is only fetched when a user actually picks something.
    summaries.push({
      ...mod,
      adapters: mod.adapters.map((a) => ({ key: a.key, match: a.match })),
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

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate repo root from " + start);
}
