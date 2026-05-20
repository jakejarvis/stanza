#!/usr/bin/env bun
/**
 * Builds the registry (if needed) and copies its JSON output into
 * `apps/web/public/registry/` so the deployed web app serves it from the
 * same origin. Both `predev` and `prebuild` invoke this — production deploys
 * therefore ship a self-contained registry alongside the website.
 *
 * The web app is the canonical registry host. The published CLI's default
 * `STANZA_REGISTRY` points at this same `/registry/` URL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const repoRoot = path.resolve(appDir, "..", "..");

const src = path.join(repoRoot, "dist", "registry");
const dest = path.join(appDir, "public", "registry");

// Build the registry on demand. The prebuild path needs this because CI may
// run the web build without first running `pnpm registry:build` at the root.
if (!fs.existsSync(src)) {
  console.log(
    `[copy-registry] ${path.relative(repoRoot, src)} not found — running registry build first.`,
  );
  const buildScript = path.join(repoRoot, "scripts", "registry-build.ts");
  const proc = Bun.spawnSync(["bun", buildScript], {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (proc.exitCode !== 0) {
    console.error("[copy-registry] registry build failed; aborting.");
    process.exit(proc.exitCode ?? 1);
  }
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`[copy-registry] ${path.relative(repoRoot, src)} → ${path.relative(repoRoot, dest)}`);
