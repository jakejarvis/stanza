import * as p from "@clack/prompts";
import type { Module, RegistryIndex, SlotId } from "@stanza/registry";
import { emptyManifest, KNOWN_SLOTS, resolveAdapter, slotLabel, slotOrder } from "@stanza/registry";
import kleur from "kleur";

import type { Registry } from "./registry-loader";

export type WizardResult = {
  name: string;
  appDir: string;
  packageManager: "pnpm" | "bun" | "npm";
  modules: Partial<Record<SlotId, Module>>;
};

/**
 * Non-interactive selections, typically from CLI flags. When provided to
 * `runInitWizard`, the wizard skips every prompt and validates the picks
 * against the registry instead. Used by `stanza init --yes` for CI / scripts.
 */
export type WizardOverrides = {
  name?: string;
  packageManager?: "pnpm" | "bun" | "npm";
  /** Slot → module id. Missing slots are skipped, not defaulted. */
  modules: Partial<Record<SlotId, string>>;
};

/**
 * Run the interactive `stanza init` wizard. Topological prompt order (defined
 * by slotOrder); slots that don't have any compatible modules given prior
 * picks are skipped. Returns the user's selections.
 *
 * When `overrides` is provided, the wizard runs in non-interactive mode:
 * picks come from `overrides` instead of prompts. Invalid picks (unknown
 * module id, resolver rejection) cause the function to log an error and
 * return null — mirroring the cancel path.
 */
export async function runInitWizard(args: {
  registry: Registry;
  defaultName: string;
  overrides?: WizardOverrides;
}): Promise<WizardResult | null> {
  const { registry, defaultName, overrides } = args;

  if (overrides) return runNonInteractive({ registry, defaultName, overrides });

  p.intro(kleur.bold().cyan("stanza"));

  const name = await p.text({
    message: "Project name",
    initialValue: defaultName,
    validate: (v) =>
      v && /^[a-z0-9][a-z0-9-]*$/i.test(v) ? undefined : "Use letters, digits, dashes.",
  });
  if (p.isCancel(name)) {
    p.cancel("Cancelled.");
    return null;
  }

  const modules: Partial<Record<SlotId, Module>> = {};

  for (const slot of slotOrder) {
    const candidates = candidatesForSlot(registry.index, slot, modules);
    if (candidates.length === 0) {
      continue;
    }

    const choices = candidates.map((m) => ({
      value: m.id,
      label: m.label,
      hint: m.description,
    }));

    const choice = await p.select({
      message: `${slotLabel(slot)}?`,
      options: [...choices, { value: "__skip__", label: kleur.dim("Skip this slot") }],
    });
    if (p.isCancel(choice)) {
      p.cancel("Cancelled.");
      return null;
    }
    if (choice === "__skip__") continue;

    const full = await registry.loadModule(slot, choice as string);
    modules[slot] = full;
  }

  const pmChoice = await p.select({
    message: "Package manager?",
    options: [
      { value: "pnpm", label: "pnpm", hint: "Recommended" },
      { value: "bun", label: "bun" },
      { value: "npm", label: "npm" },
    ],
    initialValue: "pnpm",
  });
  if (p.isCancel(pmChoice)) {
    p.cancel("Cancelled.");
    return null;
  }

  // Summary screen — what we're about to write.
  const summary = [
    `${kleur.bold("Name:")}            ${String(name)}`,
    `${kleur.bold("Package manager:")} ${String(pmChoice)}`,
    "",
    ...Object.entries(modules).map(
      ([slot, mod]) =>
        `${kleur.bold(slotLabel(slot as SlotId).padEnd(16))} ${mod!.label} ${kleur.dim(`(${mod!.id})`)}`,
    ),
  ].join("\n");
  p.note(summary, "Summary");

  const confirm = await p.confirm({ message: "Scaffold this project?" });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Cancelled.");
    return null;
  }

  return {
    name: String(name),
    appDir: "apps/web",
    packageManager: pmChoice as "pnpm" | "bun" | "npm",
    modules,
  };
}

function candidatesForSlot(
  index: RegistryIndex,
  slot: SlotId,
  picked: Partial<Record<SlotId, Module>>,
): RegistryIndex["modules"] {
  const manifest = emptyManifest({ name: "tmp" });
  return index.modules
    .filter((m) => m.slot === slot)
    .filter((m) => {
      // Use the resolver with summary adapters — we only need the peer check,
      // not the full adapter selection. Build a temp Module with empty adapter
      // bodies just to validate peers.
      const synthetic: Module = { ...m, adapters: m.adapters.map((a) => ({ ...a })) };
      const result = resolveAdapter(synthetic, { manifest, pending: picked });
      return result.ok;
    });
}

async function runNonInteractive(args: {
  registry: Registry;
  defaultName: string;
  overrides: WizardOverrides;
}): Promise<WizardResult | null> {
  const { registry, defaultName, overrides } = args;
  const name = overrides.name ?? defaultName;
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
    p.log.error(`Invalid project name: "${name}". Use letters, digits, dashes.`);
    return null;
  }

  const manifest = emptyManifest({ name: "tmp" });
  const modules: Partial<Record<SlotId, Module>> = {};
  for (const slot of slotOrder) {
    const moduleId = overrides.modules[slot];
    if (!moduleId) continue;
    const mod = await registry.loadModule(slot, moduleId).catch(() => null);
    if (!mod) {
      p.log.error(`Module not found: ${slot}/${moduleId}`);
      return null;
    }
    const result = resolveAdapter(mod, { manifest, pending: modules });
    if (!result.ok) {
      p.log.error(`Cannot use ${slot}/${moduleId}: ${result.error.kind} (check peer slots).`);
      return null;
    }
    modules[slot] = mod;
  }

  return {
    name,
    appDir: "apps/web",
    packageManager: overrides.packageManager ?? "pnpm",
    modules,
  };
}

/** Slot flag names accepted on the command line — one per known slot. */
export const SLOT_FLAGS: readonly SlotId[] = KNOWN_SLOTS;
