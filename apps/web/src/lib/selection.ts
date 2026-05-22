import type { AddonCategoryId, Module, ModuleAdapter, SlotId, TemplateRef } from "@stanza/registry";
import {
  ADDON_PACKAGE_DIR,
  addonOrder,
  emptyManifest,
  KNOWN_ADDONS,
  KNOWN_SLOTS,
  resolveAdapter,
  SLOT_PACKAGE_DIR,
  slotOrder,
} from "@stanza/registry";

import type { PackageManager } from "@/lib/package-manager";

export type Selections = Partial<Record<SlotId, string>>;
/** Add-ons are multi-choice — each category holds a list of selected ids. */
export type AddonSelections = Partial<Record<AddonCategoryId, string[]>>;

// One optional string per slot + add-on category, plus the project name.
// Derived from the id types so it tracks the canonical tuples automatically.
export type BuilderSearch = { name?: string } & Partial<Record<SlotId | AddonCategoryId, string>>;

export const DEFAULT_NAME = "my-app";

/**
 * Parse the URL search params into a name + slot selections + add-on
 * selections. Slots are single-valued; add-on categories are comma-joined
 * lists (`?testing=vitest,playwright`) — the same syntax as the CLI flags.
 * Unrecognized keys are dropped.
 */
export function parseSelections(search: BuilderSearch): {
  name: string;
  selections: Selections;
  addons: AddonSelections;
} {
  const selections: Selections = {};
  for (const slot of KNOWN_SLOTS) {
    const value = search[slot];
    if (typeof value === "string" && value.length > 0) {
      selections[slot] = value;
    }
  }
  const addons: AddonSelections = {};
  for (const category of KNOWN_ADDONS) {
    const value = search[category];
    if (typeof value === "string" && value.length > 0) {
      const ids = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 0) addons[category] = ids;
    }
  }
  const name =
    typeof search.name === "string" && search.name.length > 0 ? search.name : DEFAULT_NAME;
  return { name, selections, addons };
}

/**
 * Inverse of `parseSelections`. We omit empty fields so the URL stays terse —
 * a brand-new visit shows no query string, not `?name=my-app&framework=`.
 */
export function toSearchParams(input: {
  name: string;
  selections: Selections;
  addons?: AddonSelections;
}): BuilderSearch {
  const out: BuilderSearch = {};
  if (input.name && input.name !== DEFAULT_NAME) out.name = input.name;
  for (const slot of KNOWN_SLOTS) {
    const v = input.selections[slot];
    if (v) out[slot] = v;
  }
  for (const category of KNOWN_ADDONS) {
    const ids = input.addons?.[category];
    if (ids && ids.length > 0) out[category] = ids.join(",");
  }
  return out;
}

/**
 * Resolve the adapter for each selected slot against the current selections —
 * same logic the CLI uses on `stanza add`. Returns `null` for a slot whose
 * peers aren't satisfied yet (rare while typing).
 */
export function resolveSelectedAdapters(
  modules: Record<string, Module>,
  selections: Selections,
): Partial<Record<SlotId, { module: Module; adapter: ModuleAdapter }>> {
  const pending: Partial<Record<SlotId, Module>> = {};
  for (const slot of KNOWN_SLOTS) {
    const id = selections[slot];
    if (!id) continue;
    const mod = modules[`${slot}:${id}`];
    if (mod) pending[slot] = mod;
  }
  const out: Partial<Record<SlotId, { module: Module; adapter: ModuleAdapter }>> = {};
  for (const slot of slotOrder) {
    const mod = pending[slot];
    if (!mod) continue;
    const r = resolveAdapter(mod, { manifest: emptyManifest({ name: "t" }), pending });
    if (r.ok) out[slot] = { module: mod, adapter: r.adapter };
  }
  return out;
}

export type ResolvedAddons = Partial<
  Record<AddonCategoryId, { module: Module; adapter: ModuleAdapter }[]>
>;

/**
 * Resolve each selected add-on's adapter against the chosen slot modules
 * (so a framework-varying add-on like vitest dispatches on the framework).
 * Add-ons whose peers aren't satisfied are dropped from the result.
 */
export function resolveSelectedAddons(
  modules: Record<string, Module>,
  selections: Selections,
  addons: AddonSelections,
): ResolvedAddons {
  const pending: Partial<Record<SlotId, Module>> = {};
  for (const slot of KNOWN_SLOTS) {
    const id = selections[slot];
    if (!id) continue;
    const mod = modules[`${slot}:${id}`];
    if (mod) pending[slot] = mod;
  }
  const out: ResolvedAddons = {};
  for (const category of addonOrder) {
    const ids = addons[category];
    if (!ids?.length) continue;
    const entries: { module: Module; adapter: ModuleAdapter }[] = [];
    for (const id of ids) {
      const mod = modules[`${category}:${id}`];
      if (!mod) continue;
      const r = resolveAdapter(mod, { manifest: emptyManifest({ name: "t" }), pending });
      if (r.ok) entries.push({ module: mod, adapter: r.adapter });
    }
    if (entries.length > 0) out[category] = entries;
  }
  return out;
}

/**
 * Drop any selection whose peers aren't satisfied. Deselecting a slot (or
 * landing on a shared URL like `?orm=drizzle` with no `db`) would otherwise
 * leave the orphaned dependent selected-but-unresolvable: its card renders
 * selected yet disabled (so it can't be toggled off) and it leaks an invalid
 * flag into the generated command. Pruning to a fixpoint keeps slots and
 * add-ons in lockstep with what the resolver — and therefore the CLI — accepts.
 */
export function pruneUnresolved(
  modules: Record<string, Module>,
  selections: Selections,
  addons: AddonSelections,
): { selections: Selections; addons: AddonSelections } {
  let curSelections: Selections = { ...selections };
  let curAddons: AddonSelections = { ...addons };
  for (;;) {
    const resolved = resolveSelectedAdapters(modules, curSelections);
    const resolvedAddons = resolveSelectedAddons(modules, curSelections, curAddons);
    let removed = false;

    const nextSelections: Selections = {};
    for (const slot of KNOWN_SLOTS) {
      const id = curSelections[slot];
      if (!id) continue;
      if (resolved[slot]) nextSelections[slot] = id;
      else removed = true;
    }

    const nextAddons: AddonSelections = {};
    for (const category of KNOWN_ADDONS) {
      const ids = curAddons[category];
      if (!ids?.length) continue;
      const okIds = new Set((resolvedAddons[category] ?? []).map((e) => e.module.id));
      const kept = ids.filter((id) => okIds.has(id));
      if (kept.length !== ids.length) removed = true;
      if (kept.length > 0) nextAddons[category] = kept;
    }

    curSelections = nextSelections;
    curAddons = nextAddons;
    // Removing one entry can orphan another (a peer chain); loop until stable.
    if (!removed) return { selections: nextSelections, addons: nextAddons };
  }
}

export type SelectedFile = {
  path: string;
  template: TemplateRef;
  owner: { group: SlotId | AddonCategoryId; module: string };
};

/**
 * Derive the full file list stanza will write for the current selection.
 * Mirrors codemod-runner's resolution:
 *  - `scope: "repo"`  → repo root
 *  - `scope: "app"`   → the active app dir (defaults to `apps/web/`)
 *  - `scope: "package"` → `packages/<dir>/`
 *
 * Slots are emitted in `slotOrder`, then add-ons in `addonOrder`.
 */
export function selectedFiles(
  resolved: Partial<Record<SlotId, { module: Module; adapter: ModuleAdapter }>>,
  resolvedAddons: ResolvedAddons = {},
  appDir = "apps/web",
): SelectedFile[] {
  const out: SelectedFile[] = [];
  for (const slot of slotOrder) {
    const entry = resolved[slot];
    if (!entry) continue;
    for (const tpl of entry.adapter.templates ?? []) {
      out.push({
        path: resolveTemplatePath(tpl, SLOT_PACKAGE_DIR[slot], appDir),
        template: tpl,
        owner: { group: slot, module: entry.module.id },
      });
    }
  }
  for (const category of addonOrder) {
    for (const entry of resolvedAddons[category] ?? []) {
      for (const tpl of entry.adapter.templates ?? []) {
        out.push({
          path: resolveTemplatePath(tpl, ADDON_PACKAGE_DIR[category], appDir),
          template: tpl,
          owner: { group: category, module: entry.module.id },
        });
      }
    }
  }
  return out;
}

function resolveTemplatePath(tpl: TemplateRef, packageDir: string | null, appDir: string): string {
  if (tpl.scope === "repo") return tpl.dest;
  if (tpl.scope === "package") {
    // Defensive: if a module declares `scope: "package"` for a group with no
    // package dir, the CLI runner would error; the preview just hides it.
    return packageDir ? `packages/${packageDir}/${tpl.dest}` : tpl.dest;
  }
  return `${appDir.replace(/\/$/, "")}/${tpl.dest}`;
}

/**
 * Build the `<pm> create stanza` command from the current state. Used both by
 * the command preview display and by the copy-to-clipboard action. npm needs a
 * `--` separator to forward flags to the initializer; pnpm/bun/yarn pass them
 * through directly. Defaults to pnpm so the server OG card stays consistent.
 */
export function buildCommand(input: {
  name: string;
  selections: Selections;
  addons?: AddonSelections;
  pm?: PackageManager;
}): string {
  const pm = input.pm ?? "pnpm";
  const slotFlags = slotOrder
    .map((slot) => {
      const v = input.selections[slot];
      return v ? `--${slot}=${v}` : null;
    })
    .filter((s): s is string => Boolean(s));
  const addonFlags = addonOrder
    .map((category) => {
      const ids = input.addons?.[category];
      return ids && ids.length > 0 ? `--${category}=${ids.join(",")}` : null;
    })
    .filter((s): s is string => Boolean(s));
  const flags = [...slotFlags, ...addonFlags];
  const base = `${pm} create stanza ${input.name}`;
  if (flags.length === 0) return base;
  const separator = pm === "npm" ? " -- " : " ";
  return `${base}${separator}${flags.join(" ")}`;
}
