/**
 * PR guard (tokenless, read-only). Protects the immutability of the registry's
 * per-module version pins: for every changed `registry/modules/<slug>/**`,
 * compile that module and compare it against the already-published
 * `<base>/<slug>@<version>.json`. If the content changed but the version didn't,
 * fail — the author must bump the module's `package.json` version (a published
 * pin is immutable). A 404 (new version or new module) passes.
 *
 * Run via `jiti scripts/check-module-versions.ts`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REGISTRY_BASE_URL } from "@withstanza/schema";

import { compileRegistry } from "./compile-registry.ts";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const registryBase = process.env.STANZA_REGISTRY_BASE ?? REGISTRY_BASE_URL;

const git = (args: string[]) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main";
let range: string;
try {
  range = git(["merge-base", base, "HEAD"]);
} catch {
  range = "HEAD~1"; // local fallback
}

const slugs = new Set<string>();
for (const f of git(["diff", "--name-only", range, "HEAD"]).split("\n")) {
  const m = /^registry\/modules\/([^/]+)\//.exec(f);
  if (m) slugs.add(m[1]!);
}

if (slugs.size === 0) {
  console.log("Module version guard passed (no module changes).");
  process.exit(0);
}

const compiledDir = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-check-"));
await compileRegistry({ outDir: compiledDir });

const errors: string[] = [];
for (const slug of slugs) {
  const file = path.join(compiledDir, `${slug}.json`);
  if (!fs.existsSync(file)) continue; // module deleted — nothing to pin
  const text = fs.readFileSync(file, "utf8");
  const { version }: { version: string } = JSON.parse(text);
  const res = await fetch(`${registryBase}/${slug}@${version}.json`);
  if (res.status === 404) continue; // new version or new module
  if (!res.ok) {
    errors.push(`Could not verify "${slug}" (HTTP ${res.status}).`);
    continue;
  }
  if ((await res.text()) !== text) {
    errors.push(
      `Module "${slug}" changed but version ${version} is already published with different ` +
        `content. Bump "version" in registry/modules/${slug}/package.json.`,
    );
  }
}

if (errors.length > 0) {
  console.error("Module version guard failed:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log("Module version guard passed.");
