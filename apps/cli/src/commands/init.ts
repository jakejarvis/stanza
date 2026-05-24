import fs from "node:fs";
import path from "node:path";

import * as p from "@clack/prompts";
import type { AppSpec, CategoryId } from "@stanza/registry";
import {
  appPackageJsonBase,
  categoryHome,
  categoryOrder,
  ENV_EXAMPLE_HEADER,
  KNOWN_CATEGORIES,
  resolveAdapter,
  rootPackageJson,
} from "@stanza/registry";
import { type ArgsDef, defineCommand } from "citty";
import pc from "picocolors";

import { applyModule } from "../lib/codemod-runner";
import { ensureCleanWorktree } from "../lib/git";
import { initManifest } from "../lib/manifest";
import { loadRegistry, pickRegistryRoot } from "../lib/registry-loader";
import * as telemetry from "../lib/telemetry";
import { runInitWizard, type WizardOverrides } from "../lib/wizard";
import { commonArgs, type CliArgs } from "./_args";

// Derived from the registry constants so new categories surface in `--help`
// automatically. Each flag takes a comma-separated list of module ids;
// single-choice categories accept just one.
const categoryArgs = Object.fromEntries(
  KNOWN_CATEGORIES.map((category) => [
    category,
    { type: "string", description: `Pick ${category} module(s), comma-separated (with --yes).` },
  ]),
) satisfies ArgsDef;

export const init = defineCommand({
  meta: { name: "init", description: "Scaffold a new monorepo via the interactive wizard." },
  args: {
    name: { type: "positional", required: false, description: "Project directory name." },
    yes: {
      type: "boolean",
      default: false,
      description: "Non-interactive; take picks from flags.",
    },
    pm: { type: "string", description: "Package manager: pnpm | bun | npm." },
    ...categoryArgs,
    ...commonArgs,
  },
  run: ({ args }) => cmdInit(args),
});

export async function cmdInit(args: CliArgs): Promise<void> {
  const name = typeof args.name === "string" ? args.name : undefined;
  const registry = await loadRegistry();
  const defaultName = name ?? path.basename(process.cwd());

  const dryRun = Boolean(args["dry-run"]);
  // Guard the cwd's repo (init scaffolds into a new subdir of it). Skipped in
  // dry-run, which writes nothing. Fails fast — before the interactive wizard.
  if (!dryRun && !ensureCleanWorktree(process.cwd(), Boolean(args["dangerously-allow-dirty"]))) {
    process.exitCode = 1;
    return;
  }

  // --yes turns CLI flags into the wizard's answers (each `--<slot>=<id>` picks
  // a module for that slot; `--pm=<...>` picks the package manager). Missing
  // slots are simply skipped — no auto-defaulting, explicit is better.
  const overrides = args.yes ? overridesFromArgv(name, args) : undefined;

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
    apps: result.apps,
  });

  let manifest = initManifest({
    projectRoot,
    name: result.name,
    apps: result.apps,
    packageManager: result.packageManager,
  });

  const registryRoot = pickRegistryRoot();

  if (dryRun) p.log.info(pc.yellow("[dry-run] no files will be written"));

  const spinner = p.spinner();

  // Single-app init today, so every module targets the same app. The runner is
  // multi-app-shaped, but `stanza init` only scaffolds one app — multi-app
  // init is a planned follow-up.
  const targetApps = result.apps;
  const appHomeTarget: AppSpec[] = [result.apps[0]!];

  // Apply in `categoryOrder`, so each category's peers (earlier one-cardinality
  // picks) are already in the manifest when its framework-varying adapter resolves.
  for (const category of categoryOrder) {
    const home = categoryHome(category);
    for (const mod of result.selections[category] ?? []) {
      spinner.start(`Installing ${mod.label}`);
      const adapter = resolveAdapter(mod, {
        manifest,
        pending: {},
        targetAppId: home.kind === "app" ? appHomeTarget[0]!.id : undefined,
      });
      if (!adapter.ok) {
        spinner.stop(`${mod.label} ${pc.red("failed")}`);
        throw new Error(
          `Could not resolve adapter for ${category}/${mod.id}: ${adapter.error.kind}`,
        );
      }
      // Validate appKind when the module declares one (typically frameworks).
      if (home.kind === "app" && mod.appKind && mod.appKind !== appHomeTarget[0]!.kind) {
        throw new Error(
          `${category}/${mod.id} requires an app of kind "${mod.appKind}" but "${appHomeTarget[0]!.id}" is "${appHomeTarget[0]!.kind}".`,
        );
      }
      const r = await applyModule({
        projectRoot,
        manifest,
        module: mod,
        adapter: adapter.adapter,
        // home: "app"     → single target app
        // home: "package" → ship shims into every app (today: just one)
        // home: "repo"    → seed app for render context (the first app)
        targetApps: home.kind === "app" ? appHomeTarget : targetApps,
        registryRoot,
        dryRun,
      });
      manifest = r.manifest;
      telemetry.capture("cli_module", { action: "install", group: category, module: mod.id });
      spinner.stop(`${pc.green("✓")} ${mod.label}`);
    }
  }

  p.outro(
    [
      pc.green("Done."),
      "",
      `  ${pc.dim("$")} cd ${result.name}`,
      `  ${pc.dim("$")} ${result.packageManager} install`,
      `  ${pc.dim("$")} ${result.packageManager} dev`,
    ].join("\n"),
  );
}

function bootstrapShell(
  projectRoot: string,
  opts: { name: string; packageManager: "pnpm" | "bun" | "npm"; apps: AppSpec[] },
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

  fs.writeFileSync(path.join(projectRoot, ".env.example"), ENV_EXAMPLE_HEADER);

  // App shells — empty but layout-correct. The framework module fills each in.
  // The per-app `package.json` must exist before any module runs: the runner
  // appends deps/scripts into it, and the slot-package bootstrap wires
  // `@<name>/<dir>: workspace:*` into every consuming app's deps map.
  for (const app of opts.apps) {
    fs.mkdirSync(path.join(projectRoot, app.dir), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, app.dir, "package.json"),
      JSON.stringify(appPackageJsonBase({ name: opts.name, app }), null, 2) + "\n",
    );
  }
  fs.mkdirSync(path.join(projectRoot, "packages"), { recursive: true });
}

function overridesFromArgv(name: string | undefined, args: CliArgs): WizardOverrides {
  // Every category flag is a comma-separated list (e.g. `--testing vitest,playwright`,
  // `--framework next`); the wizard rejects >1 id for single-choice categories.
  const selections: Partial<Record<CategoryId, string[]>> = {};
  for (const category of KNOWN_CATEGORIES) {
    const value = args[category];
    if (typeof value === "string" && value.length > 0) {
      const ids = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 0) selections[category] = ids;
    }
  }
  const pm = args.pm;
  return {
    name,
    packageManager: pm === "pnpm" || pm === "bun" || pm === "npm" ? pm : undefined,
    selections,
  };
}
