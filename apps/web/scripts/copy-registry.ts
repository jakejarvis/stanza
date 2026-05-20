#!/usr/bin/env bun
/**
 * Copies the registry CDN output (`dist/registry/`) into `apps/web/public/registry/`
 * so the web builder can serve it from the same domain. Runs as a predev/prebuild
 * hook; safe to re-run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const repoRoot = path.resolve(appDir, "..", "..");

const src = path.join(repoRoot, "dist", "registry");
const dest = path.join(appDir, "public", "registry");

if (!fs.existsSync(src)) {
  console.warn(
    `[copy-registry] ${path.relative(repoRoot, src)} doesn't exist yet — run \`pnpm registry:build\` first. Skipping.`,
  );
  process.exit(0);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`[copy-registry] ${path.relative(repoRoot, src)} → ${path.relative(repoRoot, dest)}`);
