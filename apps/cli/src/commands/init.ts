import fs from "node:fs";
import path from "node:path";

import * as p from "@clack/prompts";
import { KNOWN_SLOTS, resolveAdapter, type SlotId, slotOrder } from "@stanza/registry";
import kleur from "kleur";
import type { Argv } from "mri";

import { applyModule } from "../lib/codemod-runner";
import { initManifest } from "../lib/manifest";
import { loadRegistry, pickRegistryRoot } from "../lib/registry-loader";
import { runInitWizard, type WizardOverrides } from "../lib/wizard";

export async function cmdInit(args: { name?: string; argv: Argv }): Promise<void> {
  const registry = await loadRegistry();
  const defaultName = args.name ?? path.basename(process.cwd());

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

  const dryRun = Boolean(args.argv["dry-run"]);
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
  // Root package.json
  fs.writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify(
      {
        name: opts.name,
        private: true,
        version: "0.1.0",
        packageManager: { pnpm: "pnpm@10.33.4", bun: "bun@1.3.14", npm: "npm@10.9.0" }[
          opts.packageManager
        ],
        scripts: {
          dev: `${opts.packageManager} -r run dev`,
          build: `${opts.packageManager} -r run build`,
          test: `${opts.packageManager} -r run test`,
        },
      },
      null,
      2,
    ) + "\n",
  );

  if (opts.packageManager === "pnpm") {
    fs.writeFileSync(
      path.join(projectRoot, "pnpm-workspace.yaml"),
      `packages:\n  - "apps/*"\n  - "packages/*"\n`,
    );
  } else if (opts.packageManager === "bun") {
    // Bun reads workspaces from package.json.
    const pkgPath = path.join(projectRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg.workspaces = ["apps/*", "packages/*"];
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  } else {
    const pkgPath = path.join(projectRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg.workspaces = ["apps/*", "packages/*"];
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
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
    JSON.stringify(
      {
        name: `@${opts.name}/${path.basename(opts.appDir)}`,
        version: "0.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    ) + "\n",
  );
  fs.mkdirSync(path.join(projectRoot, "packages"), { recursive: true });
}

function overridesFromArgv(name: string | undefined, argv: Argv): WizardOverrides {
  const modules: Partial<Record<SlotId, string>> = {};
  for (const slot of KNOWN_SLOTS) {
    const value = argv[slot];
    if (typeof value === "string" && value.length > 0) modules[slot] = value;
  }
  const pm = argv.pm;
  return {
    name,
    packageManager: pm === "pnpm" || pm === "bun" || pm === "npm" ? pm : undefined,
    modules,
  };
}
