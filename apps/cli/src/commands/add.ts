import fs from "node:fs";
import path from "node:path";

import * as p from "@clack/prompts";
import { resolveAdapter, type SlotId, KNOWN_SLOTS } from "@stanza/registry";
import kleur from "kleur";
import type { Argv } from "mri";

import { applyModule } from "@/lib/codemod-runner";
import { findProjectRoot, readManifest } from "@/lib/manifest";
import { loadRegistry } from "@/lib/registry-loader";

export async function cmdAdd(args: {
  slot?: string;
  moduleId?: string;
  argv: Argv;
}): Promise<void> {
  if (!args.slot || !args.moduleId) {
    p.log.error("Usage: stanza add <slot> <module>");
    process.exitCode = 1;
    return;
  }

  if (!(KNOWN_SLOTS as readonly string[]).includes(args.slot)) {
    p.log.error(`Unknown slot: ${args.slot}. Known: ${KNOWN_SLOTS.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const slot = args.slot as SlotId;

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    p.log.error("No stanza.json found in this or any parent directory.");
    process.exitCode = 1;
    return;
  }

  const manifest = readManifest(projectRoot);
  if (manifest.modules[slot]) {
    p.log.error(
      `Slot "${slot}" is already filled by "${manifest.modules[slot]!.id}". Run \`stanza remove ${slot}\` first.`,
    );
    process.exitCode = 1;
    return;
  }

  const registry = await loadRegistry();
  const mod = await registry.loadModule(slot, args.moduleId).catch(() => null);
  if (!mod) {
    p.log.error(`Module not found: ${slot}/${args.moduleId}`);
    process.exitCode = 1;
    return;
  }

  const resolved = resolveAdapter(mod, { manifest, pending: {} });
  if (!resolved.ok) {
    p.log.error(`Cannot add ${mod.label}: ${describeResolveError(resolved.error.kind)}`);
    process.exitCode = 1;
    return;
  }

  const dryRun = Boolean(args.argv["dry-run"]);
  const spinner = p.spinner();
  spinner.start(`Adding ${mod.label}`);

  const registryRoot = pickRegistryRoot();
  let result;
  try {
    result = await applyModule({
      projectRoot,
      manifest,
      module: mod,
      adapter: resolved.adapter,
      registryRoot,
      dryRun,
    });
  } catch (err) {
    spinner.stop(`${mod.label} ${kleur.red("failed")}`);
    throw err;
  }

  spinner.stop(`${kleur.green("✓")} ${mod.label} added`);
  if (result.bootstrappedPackage) {
    const { name } = result.bootstrappedPackage;
    p.log.info(`Run ${kleur.cyan("pnpm install")} to link ${kleur.cyan(name)}.`);
  }
  if (dryRun) p.log.info(kleur.yellow("[dry-run] no files were written"));
}

function describeResolveError(kind: string): string {
  switch (kind) {
    case "missing-peer":
      return "a required peer module isn't installed.";
    case "incompatible-peer":
      return "the installed peer module isn't supported.";
    case "no-adapter":
      return "no adapter matches your current stack.";
    default:
      return kind;
  }
}

function pickRegistryRoot(): string {
  const override = process.env.STANZA_REGISTRY;
  if (override && !override.startsWith("http")) return override;
  const here = path.dirname(new URL(import.meta.url).pathname);
  let dir = here;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "registry", "modules"))) {
      return path.join(dir, "registry");
    }
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate stanza registry root.");
}
