import fs from "node:fs";
import path from "node:path";

import * as p from "@clack/prompts";
import { resolveAdapter, slotOrder } from "@stanza/registry";
import kleur from "kleur";
import type { Argv } from "mri";

import { applyModule } from "@/lib/codemod-runner";
import { initManifest } from "@/lib/manifest";
import { loadRegistry, pickRegistryRoot } from "@/lib/registry-loader";
import { runInitWizard } from "@/lib/wizard";

export async function cmdInit(args: { name?: string; argv: Argv }): Promise<void> {
  const registry = await loadRegistry();
  const defaultName = args.name ?? path.basename(process.cwd());

  const result = await runInitWizard({ registry, defaultName });
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
        packageManager: { pnpm: "pnpm@9.12.0", bun: "bun@1.1.34", npm: "npm@10.9.0" }[
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
  fs.mkdirSync(path.join(projectRoot, opts.appDir), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "packages"), { recursive: true });
}
