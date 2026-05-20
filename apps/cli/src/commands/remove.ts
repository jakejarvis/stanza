import fs from "node:fs";
import path from "node:path";

import * as p from "@clack/prompts";
import { removePackageDependency, removeEnvVar } from "@stanza/codemods";
import { KNOWN_SLOTS, SLOT_PACKAGE_DIR, type SlotId } from "@stanza/registry";
import kleur from "kleur";
import type { Argv } from "mri";

import { revertCodemods } from "../lib/codemod-runner";
import { findProjectRoot, readManifest, writeManifest } from "../lib/manifest";
import { regionsOwnedBy } from "../lib/region-tracker";
import { loadRegistry } from "../lib/registry-loader";

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

  let manifest = readManifest(projectRoot);
  const installed = manifest.modules[slot];
  if (!installed) {
    p.log.warn(`Slot "${slot}" is not filled.`);
    return;
  }

  const dryRun = Boolean(args.argv["dry-run"]);
  const manualCleanup: string[] = [];

  // Step 1: revert imperative codemods first. They modify framework- or
  // peer-owned files (root layout, schema barrels, vite config) — reverts
  // need to see those files intact, before any template deletions below.
  const registry = await loadRegistry();
  const mod = await registry.loadModule(slot, installed.id).catch(() => null);
  const adapter = mod?.adapters.find((a) => a.key === installed.adapter);
  if (mod && adapter) {
    const revertResult = await revertCodemods({
      projectRoot,
      manifest,
      module: mod,
      adapter,
      dryRun,
    });
    manifest = revertResult.manifest;
    for (const id of revertResult.manualCleanup) {
      manualCleanup.push(`codemod:${id} (no revert or revert threw)`);
    }
  } else {
    p.log.warn(
      `Couldn't re-load ${installed.id}@${installed.adapter} from the registry — skipping imperative codemod reversal.`,
    );
  }

  // Step 2: reverse the declarative side — files, deps, scripts, env vars —
  // driven by whatever region claims remain after the codemod reverts.
  const owned = regionsOwnedBy(manifest, installed.id);
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
      if (!dryRun && fs.existsSync(abs)) fs.unlinkSync(abs);
      continue;
    }
    // Anything still here is a codemod-claimed region whose revert wasn't
    // dispatched (no revert defined, or it threw). Surface it for manual
    // cleanup — but don't drop the claim, since the artifact is still in
    // the file and an operator may still want to find it.
    manualCleanup.push(`${file}:${region}`);
  }

  // Strip the module record + its remaining region claims (the codemod
  // reverts already released their own; this picks up the declarative ones
  // we just processed above).
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
  manifest = { ...manifest, modules: nextModules, regions: nextRegions };

  // Step 3: sweep any internal package whose claims have all been released.
  // The bootstrap files (package.json, tsconfig.json, the workspace dep on
  // the app) are system-owned — not tracked in regions, so they'd otherwise
  // linger forever.
  const sweptPackages: string[] = [];
  const appPkgAbs = path.join(projectRoot, manifest.appDir, "package.json");
  for (const dir of new Set(
    Object.values(SLOT_PACKAGE_DIR).filter((d): d is string => d !== null),
  )) {
    const stillUsed = Object.keys(manifest.regions).some((file) =>
      file.startsWith(`packages/${dir}/`),
    );
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

  if (!dryRun) writeManifest(projectRoot, manifest);

  p.log.success(`${kleur.green("✓")} Removed ${installed.id} from ${slot}`);
  if (sweptPackages.length > 0) {
    p.log.info(`Swept packages/${sweptPackages.join(", packages/")} (no remaining slot owns it).`);
  }
  if (manualCleanup.length > 0) {
    p.log.warn(
      `${manualCleanup.length} item(s) need manual cleanup:\n` +
        manualCleanup.map((r) => `  • ${r}`).join("\n"),
    );
  }
  if (dryRun) p.log.info(kleur.yellow("[dry-run] no files were written"));
}
