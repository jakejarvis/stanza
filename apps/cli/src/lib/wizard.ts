import * as p from "@clack/prompts";
import type { CategoryId, Module, PackageManager, RegistryIndex } from "@stanza/registry";
import {
  categoryLabel,
  categoryOrder,
  emptyManifest,
  isMulti,
  KNOWN_CATEGORIES,
  resolveAdapter,
  validateProjectName,
} from "@stanza/registry";
import pc from "picocolors";

import type { Registry } from "./registry-loader";

export type WizardResult = {
  name: string;
  appDir: string;
  packageManager: "pnpm" | "bun" | "npm";
  /** Chosen modules, keyed by category. Single-choice categories hold one. */
  selections: Partial<Record<CategoryId, Module[]>>;
};

/**
 * Non-interactive selections, typically from CLI flags. When provided to
 * `runInitWizard`, the wizard skips every prompt and validates the picks
 * against the registry instead. Used by `stanza init --yes` for CI / scripts.
 */
export type WizardOverrides = {
  name?: string;
  packageManager?: "pnpm" | "bun" | "npm";
  /** Category → module ids (comma-separated on the CLI). Missing = skipped. */
  selections: Partial<Record<CategoryId, string[]>>;
};

/**
 * Run the interactive `stanza init` wizard. Topological prompt order
 * (`categoryOrder`); categories with no compatible modules given prior picks
 * are skipped. Single-choice categories prompt a `select`; multi-choice ones a
 * `multiselect`. Returns the user's selections.
 *
 * When `overrides` is provided, the wizard runs non-interactively: picks come
 * from `overrides`. Invalid picks log an error and return null.
 */
export async function runInitWizard(args: {
  registry: Registry;
  defaultName: string;
  overrides?: WizardOverrides;
}): Promise<WizardResult | null> {
  const { registry, defaultName, overrides } = args;

  if (overrides) return runNonInteractive({ registry, defaultName, overrides });

  p.intro(pc.bold(pc.cyan("stanza")));

  const name = await p.text({
    message: "Project name",
    initialValue: defaultName,
    validate: (v) => {
      const result = validateProjectName(v ?? "");
      return result.ok ? undefined : result.message;
    },
  });
  if (p.isCancel(name)) {
    p.cancel("Cancelled.");
    return null;
  }

  const selections: Partial<Record<CategoryId, Module[]>> = {};
  // One-cardinality picks double as the peer context for later categories.
  const pending: Partial<Record<CategoryId, Module>> = {};

  for (const category of categoryOrder) {
    const candidates = candidatesFor(registry.index, category, pending);
    if (candidates.length === 0) continue;

    if (isMulti(category)) {
      const picks = await p.multiselect({
        message: `${categoryLabel(category)}? ${pc.dim("(space to toggle, enter to confirm)")}`,
        options: candidates.map((m) => ({ value: m.id, label: m.label, hint: m.description })),
        required: false,
      });
      if (p.isCancel(picks)) {
        p.cancel("Cancelled.");
        return null;
      }
      const ids = picks;
      if (ids.length === 0) continue;
      selections[category] = await Promise.all(ids.map((id) => registry.loadModule(category, id)));
    } else {
      const choices = candidates.map((m) => ({ value: m.id, label: m.label, hint: m.description }));
      const choice = await p.select({
        message: `${categoryLabel(category)}?`,
        options: [...choices, { value: "__skip__", label: pc.dim("Skip") }],
      });
      if (p.isCancel(choice)) {
        p.cancel("Cancelled.");
        return null;
      }
      if (choice === "__skip__") continue;
      const full = await registry.loadModule(category, choice);
      selections[category] = [full];
      pending[category] = full;
    }
  }

  const pmChoice = await p.select<PackageManager>({
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
  const rows = KNOWN_CATEGORIES.flatMap((category) =>
    (selections[category] ?? []).map(
      (mod) =>
        `${pc.bold(categoryLabel(category).padEnd(16))} ${mod.label} ${pc.dim(`(${mod.id})`)}`,
    ),
  );
  const summary = [
    `${pc.bold("Name:")}            ${name}`,
    `${pc.bold("Package manager:")} ${pmChoice}`,
    "",
    ...rows,
  ].join("\n");
  p.note(summary, "Summary");

  const confirm = await p.confirm({ message: "Scaffold this project?" });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Cancelled.");
    return null;
  }

  return {
    name,
    appDir: "apps/web",
    packageManager: pmChoice,
    selections,
  };
}

/**
 * Modules in `category` compatible with the chosen one-cardinality picks.
 * Peer-checks each candidate against `pending` so e.g. a framework-gated
 * module only shows once a framework is chosen.
 */
function candidatesFor(
  index: RegistryIndex,
  category: CategoryId,
  pending: Partial<Record<CategoryId, Module>>,
): RegistryIndex["modules"] {
  const manifest = emptyManifest({ name: "tmp" });
  return index.modules
    .filter((m) => m.category === category)
    .filter((m) => peerCheckOk(m, manifest, pending));
}

function peerCheckOk(
  m: RegistryIndex["modules"][number],
  manifest: ReturnType<typeof emptyManifest>,
  pending: Partial<Record<CategoryId, Module>>,
): boolean {
  // Use the resolver with summary adapters — we only need the peer check.
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
  const validation = validateProjectName(name);
  if (!validation.ok) {
    p.log.error(`Invalid project name: "${name}". ${validation.message}`);
    return null;
  }

  const manifest = emptyManifest({ name: "tmp" });
  const selections: Partial<Record<CategoryId, Module[]>> = {};
  const pending: Partial<Record<CategoryId, Module>> = {};

  for (const category of categoryOrder) {
    const ids = overrides.selections[category];
    if (!ids?.length) continue;
    if (!isMulti(category) && ids.length > 1) {
      p.log.error(
        `Category "${category}" is single-choice — pass only one id, got: ${ids.join(", ")}.`,
      );
      return null;
    }
    const loaded: Module[] = [];
    for (const id of ids) {
      const mod = await registry.loadModule(category, id).catch(() => null);
      if (!mod) {
        p.log.error(`Module not found: ${category}/${id}`);
        return null;
      }
      const result = resolveAdapter(mod, { manifest, pending });
      if (!result.ok) {
        p.log.error(`Cannot use ${category}/${id}: ${result.error.kind} (check peer categories).`);
        return null;
      }
      loaded.push(mod);
    }
    selections[category] = loaded;
    if (!isMulti(category)) pending[category] = loaded[0]!;
  }

  return {
    name,
    appDir: "apps/web",
    packageManager: overrides.packageManager ?? "pnpm",
    selections,
  };
}

/** Category flag names accepted on the command line (comma-separated values). */
export const CATEGORY_FLAGS: readonly CategoryId[] = KNOWN_CATEGORIES;
