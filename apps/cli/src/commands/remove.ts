import fs from "node:fs";
import path from "node:path";

import * as p from "@clack/prompts";
import { removePackageDependency, removeEnvVar } from "@stanza/codemods";
import type { StanzaModuleRecord } from "@stanza/registry";
import { isCategoryId, isMulti, PACKAGE_DIRS, selectedAll } from "@stanza/registry";
import { defineCommand } from "citty";
import pc from "picocolors";

import { revertCodemods } from "../lib/codemod-runner";
import { ensureCleanWorktree } from "../lib/git";
import { findProjectRoot, readManifest, writeManifest } from "../lib/manifest";
import { regionsOwnedBy } from "../lib/region-tracker";
import { loadRegistry } from "../lib/registry-loader";
import * as telemetry from "../lib/telemetry";
import { commonArgs, type CliArgs } from "./_args";

export const remove = defineCommand({
  meta: {
    name: "remove",
    description: "Remove a module (id required for multi-choice categories).",
  },
  args: {
    slot: { type: "positional", required: true, description: "Category." },
    moduleId: {
      type: "positional",
      required: false,
      description: "Module id (required for multi-choice categories).",
    },
    ...commonArgs,
  },
  run: ({ args }) => cmdRemove(args),
});

export async function cmdRemove(args: CliArgs): Promise<void> {
  const slot = typeof args.slot === "string" ? args.slot : undefined;
  const moduleId = typeof args.moduleId === "string" ? args.moduleId : undefined;
  if (!slot) {
    p.log.error("Usage: stanza remove <category> [id]");
    process.exitCode = 1;
    return;
  }
  if (!isCategoryId(slot)) {
    p.log.error(`Unknown category: ${slot}`);
    process.exitCode = 1;
    return;
  }
  const category = slot;
  const group = category;

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    p.log.error("No stanza.json found.");
    process.exitCode = 1;
    return;
  }

  const dryRun = Boolean(args["dry-run"]);
  if (!dryRun && !ensureCleanWorktree(projectRoot, Boolean(args["dangerously-allow-dirty"]))) {
    process.exitCode = 1;
    return;
  }

  let manifest = readManifest(projectRoot);

  // Resolve which record we're removing. Single-choice categories take the one
  // record (id optional); multi-choice categories require an explicit id.
  const records = selectedAll(manifest, category);
  let installed: StanzaModuleRecord;
  if (isMulti(category)) {
    if (!moduleId) {
      const present = records.map((r) => r.id).join(", ");
      p.log.error(
        `Category "${category}" can hold several modules — specify which: ` +
          `\`stanza remove ${category} <id>\`${present ? ` (installed: ${present})` : ""}.`,
      );
      process.exitCode = 1;
      return;
    }
    const record = records.find((r) => r.id === moduleId);
    if (!record) {
      p.log.warn(`"${category}/${moduleId}" is not installed.`);
      return;
    }
    installed = record;
  } else {
    const record = moduleId ? records.find((r) => r.id === moduleId) : records[0];
    if (!record) {
      p.log.warn(`Category "${category}" is not filled.`);
      return;
    }
    installed = record;
  }

  const manualCleanup: string[] = [];

  // Step 1: revert imperative codemods first. They modify framework- or
  // peer-owned files (root layout, schema barrels, vite config) — reverts
  // need to see those files intact, before any template deletions below.
  const registry = await loadRegistry();
  const mod = await registry.loadModule(group, installed.id).catch(() => null);
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
  const remaining = selectedAll(manifest, category).filter((r) => r.id !== installed.id);
  const nextModules = { ...manifest.modules };
  if (remaining.length > 0) nextModules[category] = remaining;
  else delete nextModules[category];
  manifest = { ...manifest, modules: nextModules, regions: nextRegions };

  // Step 3: sweep any internal package whose claims have all been released.
  // The bootstrap files (package.json, tsconfig.json, the workspace dep on
  // the app) are system-owned — not tracked in regions, so they'd otherwise
  // linger forever.
  const sweptPackages: string[] = [];
  const appPkgAbs = path.join(projectRoot, manifest.appDir, "package.json");
  for (const dir of PACKAGE_DIRS) {
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

  telemetry.capture("cli_module", { action: "remove", group, module: installed.id });
  p.log.success(`${pc.green("✓")} Removed ${installed.id} from ${group}`);
  if (sweptPackages.length > 0) {
    p.log.info(`Swept packages/${sweptPackages.join(", packages/")} (no remaining slot owns it).`);
  }
  if (manualCleanup.length > 0) {
    p.log.warn(
      `${manualCleanup.length} item(s) need manual cleanup:\n` +
        manualCleanup.map((r) => `  • ${r}`).join("\n"),
    );
  }
  if (dryRun) p.log.info(pc.yellow("[dry-run] no files were written"));
}
