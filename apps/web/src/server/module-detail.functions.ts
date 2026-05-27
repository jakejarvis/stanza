import type {
  CategoryId,
  EnvVar,
  Module,
  ModuleAdapter,
  ModuleSummary,
  PeerRequirement,
  RegistryIndex,
} from "@stanza/registry";
import {
  emptyManifest,
  isCategoryId,
  isValidModuleId,
  KNOWN_CATEGORIES,
  mergeInstallFields,
  PEER_CATEGORIES,
  resolveAdapter,
} from "@stanza/registry";
import { createServerFn } from "@tanstack/react-start";

import type { Preview } from "@/server/highlighter";
import { renderPreview } from "@/server/highlighter.server";
import { loadRegistryFile } from "@/server/registry-base.server";

/** Typed `Object.keys` for a partial category-record (avoids a key-widening cast). */
function categoryKeys(record: Partial<Record<CategoryId, unknown>>): CategoryId[] {
  return KNOWN_CATEGORIES.filter((category) => record[category] !== undefined);
}

export type ModuleDetailInput = {
  category: CategoryId;
  id: string;
  /**
   * Explicit peer choices from the URL search params. Any peer not present
   * here gets an auto-default chosen from the module's `peers` list (when
   * declared) or from the registry index.
   */
  peers: Partial<Record<CategoryId, string>>;
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
  resolvedPeers: Partial<Record<CategoryId, string>>;
  /** For each peer category, the set of valid module ids the switcher can offer. */
  peerOptions: Partial<Record<CategoryId, string[]>>;
  /** Module-level + adapter-level fields merged with adapter-wins semantics. */
  effective: EffectiveInstallFields;
  /** Pre-rendered Shiki HTML for each template in the resolved adapter, keyed by `dest`. */
  previews: Record<string, Preview>;
  /** Light index of every module so client UI can label peer chips, etc. */
  index: RegistryIndex;
};

export const getModuleDetail = createServerFn({ method: "GET" })
  .inputValidator((data: ModuleDetailInput) => {
    // category and id flow into `loadRegistryFile(modules/${category}-${id}.json)`
    // which, in dev, calls path.resolve — unvalidated `..` segments could
    // escape the asset root. Constrain to the known shape.
    if (typeof data.category !== "string" || !isCategoryId(data.category)) {
      throw new Error(`Unknown category "${String(data.category)}".`);
    }
    if (typeof data.id !== "string" || !isValidModuleId(data.id)) {
      throw new Error(`Invalid module id "${data.id}".`);
    }
    return data;
  })
  .handler(async ({ data }): Promise<ModuleDetail | null> => {
    const index = await loadRegistryFile<RegistryIndex>("index.json");

    const summary = index.modules.find((m) => m.category === data.category && m.id === data.id);
    if (!summary) return null;

    const module = await loadRegistryFile<Module>(`modules/${data.category}-${data.id}.json`);

    const peerOptions = computePeerOptions(module, index);
    const resolvedPeers = applyAutoDefaults(module, data.peers, peerOptions);
    const adapter = pickAdapter(module, resolvedPeers);
    const effective = effectiveInstallFields(module, adapter);

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
 * For each peer category referenced by the module (via `peers` or any adapter's
 * `match`), list the allowed module ids. Falls back to the registry index
 * when the module only declares `"any"`.
 */
function computePeerOptions(
  module: Module,
  index: RegistryIndex,
): Partial<Record<CategoryId, string[]>> {
  const out: Partial<Record<CategoryId, string[]>> = {};
  const declared = module.peers ?? ({} as PeerRequirement);
  const referenced = new Set<CategoryId>();
  for (const category of categoryKeys(declared)) referenced.add(category);
  for (const adapter of module.adapters) {
    for (const category of categoryKeys(adapter.match)) referenced.add(category);
  }

  for (const category of referenced) {
    const constraint = declared[category];
    if (Array.isArray(constraint)) {
      out[category] = constraint;
    } else {
      // "any" or undefined — list every module that lives in this category.
      const ids: string[] = [];
      for (const m of index.modules) {
        if (m.category === category) ids.push(m.id);
      }
      out[category] = ids;
    }
    // De-dup and keep declaration order. Also union in any ids referenced by
    // adapters that weren't in the declared list — defensive against authors
    // adding adapter `match` entries without updating `peers`.
    const fromAdapters = new Set<string>();
    for (const adapter of module.adapters) {
      const v = adapter.match[category];
      if (v) fromAdapters.add(v);
    }
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const id of [...(out[category] ?? []), ...fromAdapters]) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }
    out[category] = merged;
  }
  return out;
}

/**
 * Fills in any unset peer category with the first option from `peerOptions`. The
 * detail page is usable from a bare URL (no search params) — the first
 * allowed value is a reasonable starting point and the user can switch via
 * the chip-row UI.
 */
function applyAutoDefaults(
  module: Module,
  peers: Partial<Record<CategoryId, string>>,
  peerOptions: Partial<Record<CategoryId, string[]>>,
): Partial<Record<CategoryId, string>> {
  const out: Partial<Record<CategoryId, string>> = { ...peers };
  for (const category of categoryKeys(peerOptions)) {
    if (out[category]) continue;
    const opts = peerOptions[category];
    if (opts && opts.length > 0) out[category] = opts[0];
  }
  // Honor module.peers for any category that's declared but not on a list (e.g.
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
function pickAdapter(module: Module, peers: Partial<Record<CategoryId, string>>): ModuleAdapter {
  const pending: Partial<Record<CategoryId, Module>> = {};
  for (const category of PEER_CATEGORIES) {
    const id = peers[category];
    if (!id) continue;
    // Build a minimal placeholder module — only `id`, `category`, `adapters` are
    // read by the resolver path we hit.
    pending[category] = {
      id,
      category,
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
  const fallback = module.adapters[0];
  if (!fallback) {
    throw new Error(
      `Module ${module.category}/${module.id} declares no adapters; cannot render detail page.`,
    );
  }
  return fallback;
}

// Union of primary + `app` overlay — the CLI routes them to different
// package.jsons, but the detail page shows what the module installs total.
function effectiveInstallFields(module: Module, adapter: ModuleAdapter): EffectiveInstallFields {
  const merged = mergeInstallFields(module, adapter);
  const envByName = new Map<string, EnvVar>();
  for (const v of merged.env) envByName.set(v.name, v);
  for (const v of merged.app.env) envByName.set(v.name, v);
  return {
    dependencies: { ...merged.dependencies, ...merged.app.dependencies },
    devDependencies: { ...merged.devDependencies, ...merged.app.devDependencies },
    scripts: { ...merged.scripts, ...merged.app.scripts },
    env: [...envByName.values()],
  };
}

export type { ModuleSummary };
