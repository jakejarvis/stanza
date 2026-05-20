import fs from "node:fs";
import path from "node:path";

import * as p from "@clack/prompts";
import { removePackageDependency, removeEnvVar } from "@stanza/codemods";
import { KNOWN_SLOTS, SLOT_PACKAGE_DIR, type SlotId } from "@stanza/registry";
import kleur from "kleur";
import type { Argv } from "mri";

import { findProjectRoot, readManifest, writeManifest } from "../manifest";
import { regionsOwnedBy } from "../region-tracker";

export async function cmdRemove(args: { slot?: string; argv: Argv }): Promise<void> {
  if (!args.slot) {
    p.log.error("Usage: stanza remove <slot>");
    process.exitCode = 1;
    return;
  }
  if (!(KNOWN_SLOTS as readonly string[]).includes(args.slot)) {
    p.log.error(`Unknown slot: ${args.slot}`);
    process.exitCode = 1;
    return;
  }
  const slot = args.slot as SlotId;

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    p.log.error("No stanza.json found.");
    process.exitCode = 1;
    return;
  }

  const manifest = readManifest(projectRoot);
  const installed = manifest.modules[slot];
  if (!installed) {
    p.log.warn(`Slot "${slot}" is not filled.`);
    return;
  }

  const owned = regionsOwnedBy(manifest, installed.id);
  const dryRun = Boolean(args.argv["dry-run"]);

  // Best-effort reversal: deps, env vars, and whole-file templates revert
  // cleanly. Regions touched by imperative codemods get reported as "needs
  // manual cleanup" until proper inverse codemods land.
  const manualCleanup: string[] = [];

  for (const { file, region } of owned) {
    const abs = path.join(projectRoot, file);
    if (file === ".env.example") {
      if (!dryRun) removeEnvVar(abs, region);
      continue;
    }
    if (file.endsWith("package.json")) {
      if (region.startsWith("dependencies.") || region.startsWith("devDependencies.")) {
        const name = region.split(".").slice(1).join(".");
        if (!dryRun) removePackageDependency(abs, name);
        continue;
      }
      if (region.startsWith("scripts.")) {
        if (!dryRun) {
          const pkg = JSON.parse(fs.readFileSync(abs, "utf8"));
          delete pkg.scripts?.[region.slice("scripts.".length)];
          fs.writeFileSync(abs, JSON.stringify(pkg, null, 2) + "\n");
        }
        continue;
      }
    }
    if (region === "file") {
      // Whole-file template — safe to delete since stanza wrote it.
      if (!dryRun && fs.existsSync(abs)) fs.unlinkSync(abs);
      continue;
    }
    manualCleanup.push(`${file}:${region}`);
  }

  // Update manifest: drop module + its regions.
  const nextRegions = { ...manifest.regions };
  for (const { file, region } of owned) {
    if (nextRegions[file]) {
      const copy = { ...nextRegions[file] };
      delete copy[region];
      if (Object.keys(copy).length === 0) delete nextRegions[file];
      else nextRegions[file] = copy;
    }
  }
  const nextModules = { ...manifest.modules };
  delete nextModules[slot];

  // Sweep: for each slot that maps to an internal package, if nothing remains
  // claimed under packages/<dir>/, tear down the bootstrap (package.json,
  // tsconfig.json, the dir itself) and drop the workspace dep from the app.
  // The system-owned bootstrap files aren't tracked as regions, so they'd
  // otherwise linger forever.
  const sweptPackages: string[] = [];
  const appPkgRel = `${manifest.appDir}/package.json`;
  const appPkgAbs = path.join(projectRoot, appPkgRel);
  for (const dir of new Set(
    Object.values(SLOT_PACKAGE_DIR).filter((d): d is string => d !== null),
  )) {
    const stillUsed = Object.keys(nextRegions).some((file) => file.startsWith(`packages/${dir}/`));
    if (stillUsed) continue;
    const pkgRoot = path.join(projectRoot, "packages", dir);
    if (!fs.existsSync(pkgRoot)) continue;
    if (!dryRun) {
      fs.rmSync(pkgRoot, { recursive: true, force: true });
      if (fs.existsSync(appPkgAbs)) {
        removePackageDependency(appPkgAbs, `@${manifest.name}/${dir}`);
      }
    }
    sweptPackages.push(dir);
  }

  if (!dryRun) {
    writeManifest(projectRoot, { ...manifest, modules: nextModules, regions: nextRegions });
  }

  p.log.success(`${kleur.green("✓")} Removed ${installed.id} from ${slot}`);
  if (sweptPackages.length > 0) {
    p.log.info(`Swept packages/${sweptPackages.join(", packages/")} (no remaining slot owns it).`);
  }
  if (manualCleanup.length > 0) {
    p.log.warn(
      `${manualCleanup.length} region(s) need manual cleanup:\n` +
        manualCleanup.map((r) => `  • ${r}`).join("\n"),
    );
  }
  if (dryRun) p.log.info(kleur.yellow("[dry-run] no files were written"));
}
