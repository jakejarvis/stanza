import fs from "node:fs";
import path from "node:path";

import * as p from "@clack/prompts";
import { removePackageDependency, removeEnvVar } from "@stanza/codemods";
import type { AppSpec, StanzaModuleRecord } from "@stanza/registry";
import {
  appsForRecord,
  categoryHome,
  DEFAULT_NAMESPACE,
  isCategoryId,
  isMulti,
  PACKAGE_DIRS,
  parseModuleSpec,
  selectedAll,
} from "@stanza/registry";
import { defineCommand } from "citty";
import pc from "picocolors";

import { revertCodemods } from "../lib/codemod-runner";
import { ensureCleanWorktree } from "../lib/git";
import { findProjectRoot, readManifest, writeManifest } from "../lib/manifest";
import { regenerateReadmeIfUnmodified } from "../lib/readme";
import { regionsOwnedBy } from "../lib/region-tracker";
import { loadRegistries } from "../lib/registry-loader";
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
    app: {
      type: "string",
      description: "Target app id (required when the module is installed in multiple apps).",
    },
    ...commonArgs,
  },
  run: ({ args }) => cmdRemove(args),
});

export async function cmdRemove(args: CliArgs): Promise<void> {
  const slot = typeof args.slot === "string" ? args.slot : undefined;
  const rawModuleId = typeof args.moduleId === "string" ? args.moduleId : undefined;
  const appFlag = typeof args.app === "string" ? args.app : undefined;
  if (!slot) {
    p.log.error("Usage: stanza remove <category> [[@<namespace>/]<id>]");
    process.exitCode = 1;
    return;
  }
  // Accept `@ns/id` so users can disambiguate when two registries ship a
  // module under the same id. We match against `record.id` (the namespace
  // hint is informational + persisted on the record on install).
  const moduleId = rawModuleId ? parseModuleSpec(rawModuleId).id : undefined;
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
  const home = categoryHome(category);

  // For app-home categories, --app scopes to records in that app. For other
  // homes the flag is mostly meaningless (records aren't app-keyed), but we
  // honor it to filter package-home records that explicitly target one app.
  const records = selectedAll(manifest, category, appFlag);

  // Resolve which record we're removing.
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
      p.log.warn(
        `"${category}/${moduleId}" is not installed${appFlag ? ` in app "${appFlag}"` : ""}.`,
      );
      return;
    }
    installed = record;
  } else {
    const record = moduleId ? records.find((r) => r.id === moduleId) : records[0];
    if (!record) {
      p.log.warn(`Category "${category}" is not filled${appFlag ? ` in app "${appFlag}"` : ""}.`);
      return;
    }
    installed = record;
  }

  // Determine which apps the module was installed for. The revert + sweep paths
  // need this to find the right files and the right package.json entries.
  const installedApps: AppSpec[] =
    home.kind === "repo" ? manifest.apps : appsForRecord(manifest, installed);

  const manualCleanup: string[] = [];

  // Step 1: revert imperative codemods first. They modify framework- or
  // peer-owned files (root layout, schema barrels, vite config) — reverts
  // need to see those files intact, before any template deletions below.
  const registry = await loadRegistries(manifest);
  const mod = await registry.loadModule(group, installed.id, installed.namespace).catch(() => null);
  const adapter = mod?.adapters.find((a) => a.key === installed.adapter);
  if (mod && adapter) {
    const revertResult = await revertCodemods({
      projectRoot,
      manifest,
      module: mod,
      adapter,
      targetApps: installedApps,
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
      // `app.dependencies.X` and `app.devDependencies.X` come from the
      // `app` install-fields overlay (package-home module routing a dep into
      // the consuming app). Strip the `app.` prefix and treat identically to
      // the primary forms — both end up calling `removePackageDependency`.
      const stripped = region.startsWith("app.") ? region.slice("app.".length) : region;
      if (stripped.startsWith("dependencies.") || stripped.startsWith("devDependencies.")) {
        const name = stripped.split(".").slice(1).join(".");
        if (!dryRun) removePackageDependency(abs, name);
        continue;
      }
      if (stripped.startsWith("scripts.")) {
        if (!dryRun) {
          const pkg = JSON.parse(fs.readFileSync(abs, "utf8"));
          delete pkg.scripts?.[stripped.slice("scripts.".length)];
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
  const remaining = (manifest.modules[category] ?? []).filter(
    (r) => !(r.id === installed.id && sameAppSet(r.apps, installed.apps)),
  );
  const nextModules = { ...manifest.modules };
  if (remaining.length > 0) nextModules[category] = remaining;
  else delete nextModules[category];
  manifest = { ...manifest, modules: nextModules, regions: nextRegions };

  // Step 3: sweep any internal package whose claims have all been released.
  // The bootstrap files (package.json, tsconfig.json, the workspace dep on
  // every consuming app) are system-owned — not tracked in regions, so they'd
  // otherwise linger forever.
  const sweptPackages: string[] = [];
  for (const dir of PACKAGE_DIRS) {
    const stillUsed = Object.keys(manifest.regions).some((file) =>
      file.startsWith(`packages/${dir}/`),
    );
    if (stillUsed) continue;
    const pkgRoot = path.join(projectRoot, "packages", dir);
    if (!fs.existsSync(pkgRoot)) continue;
    if (!dryRun) {
      fs.rmSync(pkgRoot, { recursive: true, force: true });
      // Strip the workspace dep from every app's package.json.
      for (const app of manifest.apps) {
        const appPkgAbs = path.join(projectRoot, app.dir, "package.json");
        if (fs.existsSync(appPkgAbs)) {
          removePackageDependency(appPkgAbs, `@${manifest.name}/${dir}`);
        }
      }
    }
    sweptPackages.push(dir);
  }

  if (!dryRun) writeManifest(projectRoot, manifest);

  // Refresh the project README to drop the removed module's section — but
  // only if the user hasn't edited it.
  const regen = await regenerateReadmeIfUnmodified({
    projectRoot,
    manifest,
    registry,
    dryRun,
  });
  if (regen.status === "written" && !dryRun) {
    manifest = regen.manifest;
    writeManifest(projectRoot, manifest);
  }
  if (regen.status === "skipped") {
    p.log.warn("Skipped README.md refresh (user-modified). Delete the file to regenerate.");
  }

  // Mirrors `add`: the namespace property lets the stats page bucket
  // first-party vs third-party correctly without losing the aggregate count.
  telemetry.capture("cli_module", {
    action: "remove",
    group,
    module: installed.id,
    namespace: installed.namespace ?? DEFAULT_NAMESPACE,
  });
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

function sameAppSet(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}
