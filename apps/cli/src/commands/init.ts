import fs from "node:fs";
import path from "node:path";

import * as p from "@clack/prompts";
import type { AddonCategoryId, SlotId } from "@stanza/registry";
import {
  addonOrder,
  appPackageJsonBase,
  KNOWN_ADDONS,
  KNOWN_SLOTS,
  resolveAdapter,
  rootPackageJson,
  slotOrder,
} from "@stanza/registry";
import kleur from "kleur";
import type { Argv } from "mri";

import { applyModule } from "../lib/codemod-runner";
import { ensureCleanWorktree } from "../lib/git";
import { initManifest } from "../lib/manifest";
import { loadRegistry, pickRegistryRoot } from "../lib/registry-loader";
import { runInitWizard, type WizardOverrides } from "../lib/wizard";

export async function cmdInit(args: { name?: string; argv: Argv }): Promise<void> {
  const registry = await loadRegistry();
  const defaultName = args.name ?? path.basename(process.cwd());

  const dryRun = Boolean(args.argv["dry-run"]);
  // Guard the cwd's repo (init scaffolds into a new subdir of it). Skipped in
  // dry-run, which writes nothing. Fails fast — before the interactive wizard.
  if (
    !dryRun &&
    !ensureCleanWorktree(process.cwd(), Boolean(args.argv["dangerously-allow-dirty"]))
  ) {
    process.exitCode = 1;
    return;
  }

  // --yes turns CLI flags into the wizard's answers (each `--<slot>=<id>` picks
  // a module for that slot; `--pm=<...>` picks the package manager). Missing
  // slots are simply skipped — no auto-defaulting, explicit is better.
  const overrides = args.argv.yes ? overridesFromArgv(args.name, args.argv) : undefined;

  const result = await runInitWizard({ registry, defaultName, overrides });
  if (!result) return;

  const projectRoot = path.resolve(process.cwd(), result.name);

  if (fs.existsSync(projectRoot)) {
    p.log.error(`Directory already exists: ${projectRoot}`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(projectRoot, { recursive: true });

  // Bootstrap the empty monorepo shell.
  bootstrapShell(projectRoot, {
    name: result.name,
    packageManager: result.packageManager,
    appDir: result.appDir,
  });

  let manifest = initManifest({
    projectRoot,
    name: result.name,
    appDir: result.appDir,
    packageManager: result.packageManager,
  });

  const registryRoot = pickRegistryRoot();

  if (dryRun) p.log.info(kleur.yellow("[dry-run] no files will be written"));

  const spinner = p.spinner();

  for (const slot of slotOrder) {
    const mod = result.modules[slot];
    if (!mod) continue;
    spinner.start(`Installing ${mod.label}`);
    const adapter = resolveAdapter(mod, { manifest, pending: {} });
    if (!adapter.ok) {
      spinner.stop(`${mod.label} ${kleur.red("failed")}`);
      throw new Error(`Could not resolve adapter for ${slot}/${mod.id}: ${adapter.error.kind}`);
    }
    const r = await applyModule({
      projectRoot,
      manifest,
      module: mod,
      adapter: adapter.adapter,
      registryRoot,
      dryRun,
    });
    manifest = r.manifest;
    spinner.stop(`${kleur.green("✓")} ${mod.label}`);
  }

  // Add-ons apply after all slots, so framework-varying adapters resolve
  // against the now-populated manifest.
  for (const category of addonOrder) {
    for (const mod of result.addons[category] ?? []) {
      spinner.start(`Installing ${mod.label}`);
      const adapter = resolveAdapter(mod, { manifest, pending: {} });
      if (!adapter.ok) {
        spinner.stop(`${mod.label} ${kleur.red("failed")}`);
        throw new Error(
          `Could not resolve adapter for ${category}/${mod.id}: ${adapter.error.kind}`,
        );
      }
      const r = await applyModule({
        projectRoot,
        manifest,
        module: mod,
        adapter: adapter.adapter,
        registryRoot,
        dryRun,
      });
      manifest = r.manifest;
      spinner.stop(`${kleur.green("✓")} ${mod.label}`);
    }
  }

  p.outro(
    [
      kleur.green("Done."),
      "",
      `  ${kleur.dim("$")} cd ${result.name}`,
      `  ${kleur.dim("$")} ${result.packageManager} install`,
      `  ${kleur.dim("$")} ${result.packageManager} dev`,
    ].join("\n"),
  );
}

function bootstrapShell(
  projectRoot: string,
  opts: { name: string; packageManager: "pnpm" | "bun" | "npm"; appDir: string },
) {
  // Root package.json. The shared builder emits the `workspaces` field for
  // bun/npm; pnpm reads its globs from pnpm-workspace.yaml (written below).
  fs.writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify(
      rootPackageJson({ name: opts.name, packageManager: opts.packageManager }),
      null,
      2,
    ) + "\n",
  );

  if (opts.packageManager === "pnpm") {
    fs.writeFileSync(
      path.join(projectRoot, "pnpm-workspace.yaml"),
      `packages:\n  - "apps/*"\n  - "packages/*"\n`,
    );
  }

  fs.writeFileSync(
    path.join(projectRoot, ".gitignore"),
    "node_modules/\ndist/\n.output/\n.vercel/\n.turbo/\n.env\n.env.local\n.env.*.local\n*.log\n",
  );

  fs.writeFileSync(
    path.join(projectRoot, ".env.example"),
    `# Stanza-managed environment variables.\n`,
  );

  // App shell — empty but layout-correct. The framework module fills it in.
  // The package.json must exist before any module runs: the runner appends
  // deps/scripts into it (and silently no-ops if it's absent), and the slot-
  // package bootstrap wires `@<name>/<dir>: workspace:*` into its deps map.
  fs.mkdirSync(path.join(projectRoot, opts.appDir), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, opts.appDir, "package.json"),
    JSON.stringify(appPackageJsonBase({ name: opts.name, appDir: opts.appDir }), null, 2) + "\n",
  );
  fs.mkdirSync(path.join(projectRoot, "packages"), { recursive: true });
}

function overridesFromArgv(name: string | undefined, argv: Argv): WizardOverrides {
  const modules: Partial<Record<SlotId, string>> = {};
  for (const slot of KNOWN_SLOTS) {
    const value = argv[slot];
    if (typeof value === "string" && value.length > 0) modules[slot] = value;
  }
  // Add-on flags are comma-separated lists (e.g. `--testing vitest,playwright`).
  const addons: Partial<Record<AddonCategoryId, string[]>> = {};
  for (const category of KNOWN_ADDONS) {
    const value = argv[category];
    if (typeof value === "string" && value.length > 0) {
      const ids = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 0) addons[category] = ids;
    }
  }
  const pm = argv.pm;
  return {
    name,
    packageManager: pm === "pnpm" || pm === "bun" || pm === "npm" ? pm : undefined,
    modules,
    addons,
  };
}
