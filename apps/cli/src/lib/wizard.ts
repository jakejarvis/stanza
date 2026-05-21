import * as p from "@clack/prompts";
import type { AddonCategoryId, Module, RegistryIndex, SlotId } from "@stanza/registry";
import {
  addonLabel,
  addonOrder,
  emptyManifest,
  KNOWN_ADDONS,
  KNOWN_SLOTS,
  moduleGroup,
  resolveAdapter,
  slotLabel,
  slotOrder,
} from "@stanza/registry";
import kleur from "kleur";

import type { Registry } from "./registry-loader";

export type WizardResult = {
  name: string;
  appDir: string;
  packageManager: "pnpm" | "bun" | "npm";
  modules: Partial<Record<SlotId, Module>>;
  /** Multi-choice add-ons, keyed by category. Applied after all slots. */
  addons: Partial<Record<AddonCategoryId, Module[]>>;
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
  /** Category → module ids (comma-separated on the CLI). Empty = none. */
  addons?: Partial<Record<AddonCategoryId, string[]>>;
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

  // Add-on phase — multi-choice per category, processed after slots so the
  // framework pick is available for peer-filtering.
  const addons: Partial<Record<AddonCategoryId, Module[]>> = {};
  for (const category of addonOrder) {
    const candidates = addonCandidates(registry.index, category, modules);
    if (candidates.length === 0) continue;

    const picks = await p.multiselect({
      message: `${addonLabel(category)}? ${kleur.dim("(space to toggle, enter to confirm)")}`,
      options: candidates.map((m) => ({ value: m.id, label: m.label, hint: m.description })),
      required: false,
    });
    if (p.isCancel(picks)) {
      p.cancel("Cancelled.");
      return null;
    }
    const ids = picks as string[];
    if (ids.length === 0) continue;
    addons[category] = await Promise.all(ids.map((id) => registry.loadModule(category, id)));
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
  const addonRows = Object.entries(addons).flatMap(([category, mods]) =>
    (mods ?? []).map(
      (mod) =>
        `${kleur.bold(addonLabel(category as AddonCategoryId).padEnd(16))} ${mod.label} ${kleur.dim(`(${mod.id})`)}`,
    ),
  );
  const summary = [
    `${kleur.bold("Name:")}            ${String(name)}`,
    `${kleur.bold("Package manager:")} ${String(pmChoice)}`,
    "",
    ...Object.entries(modules).map(
      ([slot, mod]) =>
        `${kleur.bold(slotLabel(slot as SlotId).padEnd(16))} ${mod!.label} ${kleur.dim(`(${mod!.id})`)}`,
    ),
    ...addonRows,
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
    addons,
  };
}

function candidatesForSlot(
  index: RegistryIndex,
  slot: SlotId,
  picked: Partial<Record<SlotId, Module>>,
): RegistryIndex["modules"] {
  const manifest = emptyManifest({ name: "tmp" });
  return index.modules
    .filter((m) => moduleGroup(m) === slot)
    .filter((m) => peerCheckOk(m, manifest, picked));
}

/**
 * Add-ons in `category` that are compatible with the chosen slot modules.
 * Same peer-check trick as `candidatesForSlot`, but filters on `category` and
 * resolves against the already-picked slot modules (so a framework-gated
 * add-on like vitest only shows once a framework is chosen).
 */
function addonCandidates(
  index: RegistryIndex,
  category: AddonCategoryId,
  pickedSlots: Partial<Record<SlotId, Module>>,
): RegistryIndex["modules"] {
  const manifest = emptyManifest({ name: "tmp" });
  return index.modules
    .filter((m) => moduleGroup(m) === category)
    .filter((m) => peerCheckOk(m, manifest, pickedSlots));
}

function peerCheckOk(
  m: RegistryIndex["modules"][number],
  manifest: ReturnType<typeof emptyManifest>,
  pending: Partial<Record<SlotId, Module>>,
): boolean {
  // Use the resolver with summary adapters — we only need the peer check, not
  // the full adapter selection. Build a temp Module with empty adapter bodies
  // just to validate peers.
  const synthetic = { ...m, adapters: m.adapters.map((a) => ({ ...a })) } as Module;
  return resolveAdapter(synthetic, { manifest, pending }).ok;
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

  // Add-ons resolve against the chosen slot modules (framework now present).
  const addons: Partial<Record<AddonCategoryId, Module[]>> = {};
  for (const category of addonOrder) {
    const ids = overrides.addons?.[category];
    if (!ids?.length) continue;
    const loaded: Module[] = [];
    for (const id of ids) {
      const mod = await registry.loadModule(category, id).catch(() => null);
      if (!mod) {
        p.log.error(`Module not found: ${category}/${id}`);
        return null;
      }
      const result = resolveAdapter(mod, { manifest, pending: modules });
      if (!result.ok) {
        p.log.error(`Cannot use ${category}/${id}: ${result.error.kind} (check peer slots).`);
        return null;
      }
      loaded.push(mod);
    }
    addons[category] = loaded;
  }

  return {
    name,
    appDir: "apps/web",
    packageManager: overrides.packageManager ?? "pnpm",
    modules,
    addons,
  };
}

/** Slot flag names accepted on the command line — one per known slot. */
export const SLOT_FLAGS: readonly SlotId[] = KNOWN_SLOTS;

/** Add-on category flag names accepted on the command line (comma-separated). */
export const ADDON_FLAGS: readonly AddonCategoryId[] = KNOWN_ADDONS;
