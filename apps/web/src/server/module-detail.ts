import type {
  EnvVar,
  Module,
  ModuleAdapter,
  ModuleSummary,
  PeerRequirement,
  RegistryIndex,
  SlotId,
} from "@stanza/registry";
import { KNOWN_SLOTS, emptyManifest, resolveAdapter } from "@stanza/registry";
import { createServerFn } from "@tanstack/react-start";

import { renderPreview, type Preview } from "@/server/highlighter";
import { loadRegistryFile } from "@/server/registry-base";

export type ModuleDetailInput = {
  slot: SlotId;
  id: string;
  /**
   * Explicit peer choices from the URL search params. Any peer not present
   * here gets an auto-default chosen from the module's `peers` list (when
   * declared) or from the registry index.
   */
  peers: Partial<Record<SlotId, string>>;
};

export type EffectiveInstallFields = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  env: EnvVar[];
  scripts: Record<string, string>;
};

export type ModuleDetail = {
  module: Module;
  /** Adapter the resolver picked, given the (possibly auto-defaulted) peers. */
  adapter: ModuleAdapter;
  /**
   * Peer assignments actually used for resolution — explicit + auto-defaults.
   * The detail page renders the switcher with these values pre-selected so the
   * UI reflects what's being shown even when the URL is empty.
   */
  resolvedPeers: Partial<Record<SlotId, string>>;
  /** For each peer slot, the set of valid module ids the switcher can offer. */
  peerOptions: Partial<Record<SlotId, string[]>>;
  /** Module-level + adapter-level fields merged with adapter-wins semantics. */
  effective: EffectiveInstallFields;
  /** Pre-rendered Shiki HTML for each template in the resolved adapter, keyed by `dest`. */
  previews: Record<string, Preview>;
  /** Light index of every module so client UI can label peer chips, etc. */
  index: RegistryIndex;
};

export const getModuleDetail = createServerFn({ method: "GET" })
  .inputValidator((data: ModuleDetailInput) => data)
  .handler(async ({ data }): Promise<ModuleDetail | null> => {
    const index = await loadRegistryFile<RegistryIndex>("index.json");

    const summary = index.modules.find((m) => m.slot === data.slot && m.id === data.id);
    if (!summary) return null;

    const module = await loadRegistryFile<Module>(`modules/${data.slot}-${data.id}.json`);

    const peerOptions = computePeerOptions(module, index);
    const resolvedPeers = applyAutoDefaults(module, data.peers, peerOptions);
    const adapter = pickAdapter(module, resolvedPeers);
    const effective = mergeInstallFields(module, adapter);

    const previewEntries = await Promise.all(
      (adapter.templates ?? []).map(async (tpl) => {
        const content = tpl.content ?? "";
        const preview = await renderPreview(content, tpl.dest);
        return [tpl.dest, preview] as const;
      }),
    );

    return {
      module,
      adapter,
      resolvedPeers,
      peerOptions,
      effective,
      previews: Object.fromEntries(previewEntries),
      index,
    };
  });

/**
 * For each peer slot referenced by the module (via `peers` or any adapter's
 * `match`), list the allowed module ids. Falls back to the registry index
 * when the module only declares `"any"`.
 */
function computePeerOptions(
  module: Module,
  index: RegistryIndex,
): Partial<Record<SlotId, string[]>> {
  const out: Partial<Record<SlotId, string[]>> = {};
  const declared = module.peers ?? ({} as PeerRequirement);
  const referenced = new Set<SlotId>();
  for (const slot of Object.keys(declared) as SlotId[]) referenced.add(slot);
  for (const adapter of module.adapters) {
    for (const slot of Object.keys(adapter.match) as SlotId[]) referenced.add(slot);
  }

  for (const slot of referenced) {
    const constraint = declared[slot];
    if (Array.isArray(constraint)) {
      out[slot] = constraint;
    } else {
      // "any" or undefined — list every module that lives in this slot.
      out[slot] = index.modules.filter((m) => m.slot === slot).map((m) => m.id);
    }
    // De-dup and keep declaration order. Also union in any ids referenced by
    // adapters that weren't in the declared list — defensive against authors
    // adding adapter `match` entries without updating `peers`.
    const fromAdapters = new Set<string>();
    for (const adapter of module.adapters) {
      const v = adapter.match[slot];
      if (v) fromAdapters.add(v);
    }
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const id of [...(out[slot] ?? []), ...fromAdapters]) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }
    out[slot] = merged;
  }
  return out;
}

/**
 * Fills in any unset peer slot with the first option from `peerOptions`. The
 * detail page is usable from a bare URL (no search params) — the first
 * allowed value is a reasonable starting point and the user can switch via
 * the chip-row UI.
 */
function applyAutoDefaults(
  module: Module,
  peers: Partial<Record<SlotId, string>>,
  peerOptions: Partial<Record<SlotId, string[]>>,
): Partial<Record<SlotId, string>> {
  const out: Partial<Record<SlotId, string>> = { ...peers };
  for (const slot of Object.keys(peerOptions) as SlotId[]) {
    if (out[slot]) continue;
    const opts = peerOptions[slot];
    if (opts && opts.length > 0) out[slot] = opts[0];
  }
  // Honor module.peers for any slot that's declared but not on a list (e.g.
  // "any" constraint without an adapter match). Above already covers it via
  // the index lookup.
  void module; // keep param for future use; signature kept stable
  return out;
}

/**
 * Pick the matching adapter for the resolved peer set. Builds a synthetic
 * `pending` from the resolved peers so we can reuse `resolveAdapter`.
 *
 * Falls back to the first adapter if resolution fails — the page still has
 * something useful to render and the switcher will let the user fix it.
 */
function pickAdapter(module: Module, peers: Partial<Record<SlotId, string>>): ModuleAdapter {
  const pending: Partial<Record<SlotId, Module>> = {};
  for (const slot of KNOWN_SLOTS) {
    const id = peers[slot];
    if (!id) continue;
    // Build a minimal placeholder module — only `id`, `slot`, `adapters` are
    // read by the resolver path we hit.
    pending[slot] = {
      id,
      slot,
      label: id,
      description: "",
      version: "0.0.0",
      adapters: [],
    } satisfies Module;
  }
  const r = resolveAdapter(module, { manifest: emptyManifest({ name: "t" }), pending });
  if (r.ok) return r.adapter;
  // Defensive: the auto-defaults should usually satisfy the constraints, but
  // if the module declares conflicting peer + adapter sets we still need to
  // render something. The first adapter is the closest analogue to a default.
  return module.adapters[0]!;
}

/**
 * Adapter-wins merge of install fields. Matches the runner's behavior:
 *  - `dependencies` / `devDependencies` / `scripts` merge per-key
 *  - `env` merges by `name` (adapter overrides module)
 */
export function mergeInstallFields(module: Module, adapter: ModuleAdapter): EffectiveInstallFields {
  const dependencies: Record<string, string> = {
    ...module.dependencies,
    ...adapter.dependencies,
  };
  const devDependencies: Record<string, string> = {
    ...module.devDependencies,
    ...adapter.devDependencies,
  };
  const scripts: Record<string, string> = {
    ...module.scripts,
    ...adapter.scripts,
  };
  const envByName = new Map<string, EnvVar>();
  for (const e of module.env ?? []) envByName.set(e.name, e);
  for (const e of adapter.env ?? []) envByName.set(e.name, e);
  return {
    dependencies,
    devDependencies,
    env: [...envByName.values()],
    scripts,
  };
}

export type { ModuleSummary };
