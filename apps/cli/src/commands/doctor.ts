import fs from "node:fs";
import path from "node:path";

import * as p from "@clack/prompts";
import { PACKAGE_DIRS } from "@stanza/registry";
import { defineCommand } from "citty";
import pc from "picocolors";

import { findProjectRoot, readManifest } from "../lib/manifest";
import { commonArgs } from "./_args";

export const doctor = defineCommand({
  meta: {
    name: "doctor",
    description: "Check stanza.json against the filesystem for drift (read-only).",
  },
  args: { telemetry: commonArgs.telemetry },
  run: () => cmdDoctor(),
});

/**
 * Verify that every region claim in `stanza.json` still matches reality on
 * disk: claimed files exist, claimed deps/scripts/env vars are still present,
 * and each internal package with claims is wired up. Read-only — reports drift
 * and exits non-zero, but changes nothing.
 */
export async function cmdDoctor(): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    p.log.error("No stanza.json found in this or any parent directory.");
    process.exitCode = 1;
    return;
  }

  const manifest = readManifest(projectRoot);
  const issues: string[] = [];

  // 1. Region claims ↔ filesystem.
  for (const [file, regions] of Object.entries(manifest.regions)) {
    const abs = path.join(projectRoot, file);
    for (const region of Object.keys(regions)) {
      if (region === "file") {
        if (!fs.existsSync(abs)) issues.push(`${file} — claimed file is missing`);
        continue;
      }
      if (file === ".env.example") {
        if (!envHasVar(abs, region)) issues.push(`${file} — env var "${region}" is missing`);
        continue;
      }
      if (file.endsWith("package.json")) {
        // `app.`-prefixed regions come from the app-overlay; the on-disk shape
        // is identical (dependencies./devDependencies./scripts.).
        const stripped = region.startsWith("app.") ? region.slice("app.".length) : region;
        if (stripped.startsWith("dependencies.") || stripped.startsWith("devDependencies.")) {
          const [kind, ...rest] = stripped.split(".");
          const name = rest.join(".");
          if (!pkgHasKey(abs, kind!, name)) issues.push(`${file} — ${stripped} is missing`);
          continue;
        }
        if (stripped.startsWith("scripts.")) {
          const name = stripped.slice("scripts.".length);
          if (!pkgHasKey(abs, "scripts", name)) issues.push(`${file} — scripts.${name} is missing`);
          continue;
        }
      }
      // Codemod-managed regions (AST edits, marker blocks) can't be verified
      // offline — only flag when the host file is gone entirely.
      if (!fs.existsSync(abs)) {
        issues.push(`${file} — host of codemod region "${region}" is missing`);
      }
    }
  }

  // 2. Internal packages: a slot with region claims must have its package.json,
  // and every app should carry the workspace dependency on it.
  for (const dir of PACKAGE_DIRS) {
    const hasClaims = Object.keys(manifest.regions).some((f) => f.startsWith(`packages/${dir}/`));
    if (!hasClaims) continue;
    const pkgJson = path.join(projectRoot, "packages", dir, "package.json");
    if (!fs.existsSync(pkgJson)) {
      issues.push(`packages/${dir}/package.json — slot has region claims but no package`);
      continue;
    }
    const depName = `@${manifest.name}/${dir}`;
    for (const app of manifest.apps) {
      const appPkg = path.join(projectRoot, app.dir, "package.json");
      if (!fs.existsSync(appPkg)) continue;
      if (!pkgHasKey(appPkg, "dependencies", depName)) {
        issues.push(`${app.dir}/package.json — missing workspace dependency "${depName}"`);
      }
    }
  }

  if (issues.length === 0) {
    p.log.success(`${pc.green("✓")} No drift — stanza.json matches the filesystem.`);
    return;
  }
  p.log.error(`${issues.length} issue(s) found:\n` + issues.map((i) => `  • ${i}`).join("\n"));
  process.exitCode = 1;
}

function envHasVar(file: string, name: string): boolean {
  if (!fs.existsSync(file)) return false;
  const content = fs.readFileSync(file, "utf8");
  return new RegExp(`^\\s*${escapeRegExp(name)}=`, "m").test(content);
}

function pkgHasKey(file: string, kind: string, name: string): boolean {
  if (!fs.existsSync(file)) return false;
  try {
    const pkg: Record<string, Record<string, unknown> | undefined> = JSON.parse(
      fs.readFileSync(file, "utf8"),
    );
    return Boolean(pkg[kind]?.[name]);
  } catch {
    return false;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
