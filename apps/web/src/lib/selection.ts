import type { Module, ModuleAdapter, SlotId, TemplateRef } from "@stanza/registry";
import { KNOWN_SLOTS, emptyManifest, resolveAdapter, slotOrder } from "@stanza/registry";

export type Selections = Partial<Record<SlotId, string>>;

export type BuilderSearch = {
  name?: string;
  framework?: string;
  styling?: string;
  db?: string;
  orm?: string;
  auth?: string;
};

export const DEFAULT_NAME = "my-app";

/**
 * Parse the URL search params into a name + selections record. Any unrecognized
 * slot keys are dropped. Missing values default to `undefined`, which the rest
 * of the builder treats as "not picked yet".
 */
export function parseSelections(search: BuilderSearch): { name: string; selections: Selections } {
  const selections: Selections = {};
  for (const slot of KNOWN_SLOTS) {
    const value = search[slot];
    if (typeof value === "string" && value.length > 0) {
      selections[slot] = value;
    }
  }
  const name =
    typeof search.name === "string" && search.name.length > 0 ? search.name : DEFAULT_NAME;
  return { name, selections };
}

/**
 * Inverse of `parseSelections`. We omit empty fields so the URL stays terse —
 * a brand-new visit shows no query string, not `?name=my-app&framework=`.
 */
export function toSearchParams(input: { name: string; selections: Selections }): BuilderSearch {
  const out: BuilderSearch = {};
  if (input.name && input.name !== DEFAULT_NAME) out.name = input.name;
  for (const slot of KNOWN_SLOTS) {
    const v = input.selections[slot];
    if (v) out[slot] = v;
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

export type SelectedFile = {
  path: string;
  template: TemplateRef;
  owner: { slot: SlotId; module: string };
};

/**
 * Derive the full file list stanza will write for the current selection.
 * Mirrors codemod-runner's resolution: `scope: "app"` files are prefixed by
 * the active app dir (we default to `apps/web/`); `scope: "repo"` files land
 * at the repo root. Returns a deterministic order grouped by slot order.
 */
export function selectedFiles(
  resolved: Partial<Record<SlotId, { module: Module; adapter: ModuleAdapter }>>,
  appDir = "apps/web",
): SelectedFile[] {
  const out: SelectedFile[] = [];
  for (const slot of slotOrder) {
    const entry = resolved[slot];
    if (!entry) continue;
    for (const tpl of entry.adapter.templates ?? []) {
      const path = tpl.scope === "repo" ? tpl.dest : `${appDir.replace(/\/$/, "")}/${tpl.dest}`;
      out.push({ path, template: tpl, owner: { slot, module: entry.module.id } });
    }
  }
  return out;
}

/**
 * Build the `pnpm create stanza` command from the current state. Used both by
 * the command-bar display and by the copy-to-clipboard action.
 */
export function buildCommand(input: { name: string; selections: Selections }): string {
  const flags = slotOrder
    .map((slot) => {
      const v = input.selections[slot];
      return v ? `--${slot}=${v}` : null;
    })
    .filter((s): s is string => Boolean(s));
  return `pnpm create stanza ${input.name}${flags.length ? " " + flags.join(" ") : ""}`;
}
