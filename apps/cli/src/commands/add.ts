import * as p from "@clack/prompts";
import type { AddonCategoryId, SlotId } from "@stanza/registry";
import { KNOWN_ADDONS, KNOWN_SLOTS, resolveAdapter } from "@stanza/registry";
import { defineCommand } from "citty";
import pc from "picocolors";

import { applyModule } from "../lib/codemod-runner";
import { ensureCleanWorktree } from "../lib/git";
import { findProjectRoot, readManifest } from "../lib/manifest";
import { loadRegistry, pickRegistryRoot } from "../lib/registry-loader";
import * as telemetry from "../lib/telemetry";
import { commonArgs, type CliArgs } from "./_args";

export const add = defineCommand({
  meta: { name: "add", description: "Add a slot module or an add-on to the current project." },
  args: {
    slot: { type: "positional", required: true, description: "Slot or add-on category." },
    moduleId: { type: "positional", required: true, description: "Module id." },
    ...commonArgs,
  },
  run: ({ args }) => cmdAdd(args),
});

export async function cmdAdd(args: CliArgs): Promise<void> {
  const slot = typeof args.slot === "string" ? args.slot : undefined;
  const moduleId = typeof args.moduleId === "string" ? args.moduleId : undefined;
  if (!slot || !moduleId) {
    p.log.error("Usage: stanza add <slot|category> <module>");
    process.exitCode = 1;
    return;
  }

  const isSlot = (KNOWN_SLOTS as readonly string[]).includes(slot);
  const isCategory = (KNOWN_ADDONS as readonly string[]).includes(slot);
  if (!isSlot && !isCategory) {
    p.log.error(
      `Unknown slot or category: ${slot}. Slots: ${KNOWN_SLOTS.join(", ")}. Add-ons: ${KNOWN_ADDONS.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  const group = slot;

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    p.log.error("No stanza.json found in this or any parent directory.");
    process.exitCode = 1;
    return;
  }

  const dryRun = Boolean(args["dry-run"]);
  if (!dryRun && !ensureCleanWorktree(projectRoot, Boolean(args["dangerously-allow-dirty"]))) {
    process.exitCode = 1;
    return;
  }

  const manifest = readManifest(projectRoot);
  if (isSlot) {
    const slotId = group as SlotId;
    if (manifest.modules[slotId]) {
      p.log.error(
        `Slot "${slotId}" is already filled by "${manifest.modules[slotId]!.id}". Run \`stanza remove ${slotId}\` first.`,
      );
      process.exitCode = 1;
      return;
    }
  } else {
    // Add-on categories hold many modules. Only reject re-adding the same id.
    const category = group as AddonCategoryId;
    if (manifest.addons[category]?.some((r) => r.id === moduleId)) {
      p.log.error(`"${category}/${moduleId}" is already added.`);
      process.exitCode = 1;
      return;
    }
  }

  const registry = await loadRegistry();
  const mod = await registry.loadModule(group, moduleId).catch(() => null);
  if (!mod) {
    p.log.error(`Module not found: ${group}/${moduleId}`);
    process.exitCode = 1;
    return;
  }

  const resolved = resolveAdapter(mod, { manifest, pending: {} });
  if (!resolved.ok) {
    p.log.error(`Cannot add ${mod.label}: ${describeResolveError(resolved.error.kind)}`);
    process.exitCode = 1;
    return;
  }

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
    spinner.stop(`${mod.label} ${pc.red("failed")}`);
    throw err;
  }

  telemetry.capture("cli_module", { action: "install", group, module: mod.id });
  spinner.stop(`${pc.green("✓")} ${mod.label} added`);
  if (result.bootstrappedPackage) {
    const { name } = result.bootstrappedPackage;
    p.log.info(`Run ${pc.cyan("pnpm install")} to link ${pc.cyan(name)}.`);
  }
  if (dryRun) p.log.info(pc.yellow("[dry-run] no files were written"));
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
