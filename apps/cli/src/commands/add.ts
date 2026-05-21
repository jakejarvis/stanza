import * as p from "@clack/prompts";
import type { AddonCategoryId, SlotId } from "@stanza/registry";
import { KNOWN_ADDONS, KNOWN_SLOTS, resolveAdapter } from "@stanza/registry";
import kleur from "kleur";
import type { Argv } from "mri";

import { applyModule } from "../lib/codemod-runner";
import { findProjectRoot, readManifest } from "../lib/manifest";
import { loadRegistry, pickRegistryRoot } from "../lib/registry-loader";

export async function cmdAdd(args: {
  slot?: string;
  moduleId?: string;
  argv: Argv;
}): Promise<void> {
  if (!args.slot || !args.moduleId) {
    p.log.error("Usage: stanza add <slot|category> <module>");
    process.exitCode = 1;
    return;
  }

  const isSlot = (KNOWN_SLOTS as readonly string[]).includes(args.slot);
  const isCategory = (KNOWN_ADDONS as readonly string[]).includes(args.slot);
  if (!isSlot && !isCategory) {
    p.log.error(
      `Unknown slot or category: ${args.slot}. Slots: ${KNOWN_SLOTS.join(", ")}. Add-ons: ${KNOWN_ADDONS.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  const group = args.slot;

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    p.log.error("No stanza.json found in this or any parent directory.");
    process.exitCode = 1;
    return;
  }

  const manifest = readManifest(projectRoot);
  if (isSlot) {
    const slot = group as SlotId;
    if (manifest.modules[slot]) {
      p.log.error(
        `Slot "${slot}" is already filled by "${manifest.modules[slot]!.id}". Run \`stanza remove ${slot}\` first.`,
      );
      process.exitCode = 1;
      return;
    }
  } else {
    // Add-on categories hold many modules. Only reject re-adding the same id.
    const category = group as AddonCategoryId;
    if (manifest.addons[category]?.some((r) => r.id === args.moduleId)) {
      p.log.error(`"${category}/${args.moduleId}" is already added.`);
      process.exitCode = 1;
      return;
    }
  }

  const registry = await loadRegistry();
  const mod = await registry.loadModule(group, args.moduleId).catch(() => null);
  if (!mod) {
    p.log.error(`Module not found: ${group}/${args.moduleId}`);
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
