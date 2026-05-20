import * as p from "@clack/prompts";
import type { Module, RegistryIndex, SlotId } from "@stanza/registry";
import { resolveAdapter, slotOrder } from "@stanza/registry";
import { emptyManifest } from "@stanza/registry";
import kleur from "kleur";

import type { Registry } from "./registry-loader";

export type WizardResult = {
  name: string;
  appDir: string;
  packageManager: "pnpm" | "bun" | "npm";
  modules: Partial<Record<SlotId, Module>>;
};

/**
 * Run the interactive `stanza init` wizard. Topological prompt order (defined
 * by slotOrder); slots that don't have any compatible modules given prior
 * picks are skipped. Returns the user's selections.
 */
export async function runInitWizard(args: {
  registry: Registry;
  defaultName: string;
}): Promise<WizardResult | null> {
  const { registry, defaultName } = args;

  p.intro(kleur.bold().cyan("stanza"));

  const name = await p.text({
    message: "Project name",
    initialValue: defaultName,
    validate: (v) =>
      v && /^[a-z0-9][a-z0-9-]*$/i.test(v) ? undefined : "Use letters, digits, dashes.",
  });
  if (p.isCancel(name)) return cancel();

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
    if (p.isCancel(choice)) return cancel();
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
  if (p.isCancel(pmChoice)) return cancel();

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
  if (p.isCancel(confirm) || !confirm) return cancel();

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

function slotLabel(slot: SlotId): string {
  return { framework: "Framework", styling: "Styling", db: "Database", orm: "ORM", auth: "Auth" }[
    slot
  ];
}

function cancel(): null {
  p.cancel("Cancelled.");
  return null;
}
