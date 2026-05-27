import type {
  AppSpec,
  CategoryId,
  Module,
  ModuleMetadata,
  Resolved,
  ResolvedEntry,
} from "@stanza/registry";
import {
  categoryOrder,
  defaultWebApp,
  emptyManifest,
  KNOWN_CATEGORIES,
  PEER_CATEGORIES,
  resolveAdapter,
} from "@stanza/registry";

import {
  DEFAULT_PACKAGE_MANAGER,
  isPackageManager,
  type PackageManager,
} from "@/lib/package-manager";

/** Selected module ids per category. Single-choice categories hold ≤ 1. */
export type Selections = Partial<Record<CategoryId, string[]>>;

// One optional comma-joined string per category, plus the project name and the
// chosen package manager.
export type BuilderSearch = { name?: string; pm?: string } & Partial<Record<CategoryId, string>>;

export const DEFAULT_NAME = "my-app";

const SEARCH_KEYS = ["name", "pm", ...KNOWN_CATEGORIES] as const;

/**
 * Shared by the route's `validateSearch` and the server function's
 * `inputValidator` so direct HTTP calls can't bypass the allow-list.
 */
// Cap to keep a hostile URL from cramming thousands of comma-joined ids into
// any single search param. Well above any legitimate selection.
const MAX_SEARCH_PARAM_LEN = 512;

export function validateBuilderSearch(input: Record<string, unknown>): BuilderSearch {
  const out: BuilderSearch = {};
  for (const key of SEARCH_KEYS) {
    const v = input[key];
    if (typeof v === "string" && v.length > 0 && v.length <= MAX_SEARCH_PARAM_LEN) out[key] = v;
  }
  return out;
}

/**
 * Parse URL search params into a name + per-category selections. Every category
 * is a comma-joined list (`?testing=vitest,playwright`, `?framework=next`) — the
 * same syntax as the CLI flags. Unrecognized keys are dropped.
 */
export function parseSelections(search: BuilderSearch): {
  name: string;
  pm: PackageManager;
  selections: Selections;
} {
  const selections: Selections = {};
  for (const category of KNOWN_CATEGORIES) {
    const value = search[category];
    if (typeof value === "string" && value.length > 0) {
      const ids = value.split(",").flatMap((s) => {
        const trimmed = s.trim();
        return trimmed ? [trimmed] : [];
      });
      if (ids.length > 0) selections[category] = ids;
    }
  }
  const name =
    typeof search.name === "string" && search.name.length > 0 ? search.name : DEFAULT_NAME;
  const pm = isPackageManager(search.pm) ? search.pm : DEFAULT_PACKAGE_MANAGER;
  return { name, pm, selections };
}

/**
 * Inverse of `parseSelections`. Omits empty fields so the URL stays terse — a
 * brand-new visit shows no query string.
 */
export function toSearchParams(input: {
  name: string;
  selections: Selections;
  pm?: PackageManager;
}): BuilderSearch {
  const out: BuilderSearch = {};
  if (input.name && input.name !== DEFAULT_NAME) out.name = input.name;
  if (input.pm && input.pm !== DEFAULT_PACKAGE_MANAGER) out.pm = input.pm;
  for (const category of KNOWN_CATEGORIES) {
    const ids = input.selections[category];
    if (ids && ids.length > 0) out[category] = ids.join(",");
  }
  return out;
}

/** Build the peer context — only one-cardinality categories can be peers. */
function pendingPeers<M extends { id: string }>(
  modules: Record<string, M>,
  selections: Selections,
): Partial<Record<CategoryId, M>> {
  const pending: Partial<Record<CategoryId, M>> = {};
  for (const category of PEER_CATEGORIES) {
    const id = selections[category]?.[0];
    if (!id) continue;
    const mod = modules[`${category}:${id}`];
    if (mod) pending[category] = mod;
  }
  return pending;
}

/**
 * Active peer ids — the URL-derived equivalent of the CLI runner's
 * `activePeerIds(manifest, app.id)`. Single source of truth for what
 * `synthesizeTemplates` should expose under `{{peers.<category>}}` in the
 * Handlebars render context.
 */
export function selectedPeerIds(selections: Selections): Partial<Record<CategoryId, string>> {
  const out: Partial<Record<CategoryId, string>> = {};
  for (const category of PEER_CATEGORIES) {
    const id = selections[category]?.[0];
    if (id) out[category] = id;
  }
  return out;
}

/**
 * Resolve each selected module's adapter against the chosen one-cardinality
 * peers — the same logic the CLI uses. Modules whose peers aren't satisfied are
 * dropped from the result.
 */
export function resolveSelected(modules: Record<string, Module>, selections: Selections): Resolved {
  const pending = pendingPeers(modules, selections);
  const out: Resolved = {};
  for (const category of categoryOrder) {
    const ids = selections[category];
    if (!ids?.length) continue;
    const entries: ResolvedEntry[] = [];
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
 * Drop any selection whose peers aren't satisfied. Deselecting a peer (or
 * landing on a shared URL like `?orm=drizzle` with no `db`) would otherwise
 * leave the orphaned dependent selected-but-unresolvable. Pruning to a fixpoint
 * keeps selections in lockstep with what the resolver — and the CLI — accepts.
 *
 * Takes `ModuleMetadata[]` rather than full `Module`s — the resolver only reads
 * `id`/`peers`/`adapters[].match`, all of which the index metadata already
 * carries. That lets the home route avoid shipping the ~400 KB hydrated
 * catalog down to the client.
 */
export function pruneUnresolved(metadata: ModuleMetadata[], selections: Selections): Selections {
  const byKey = new Map<string, ModuleMetadata>();
  for (const m of metadata) byKey.set(`${m.category}:${m.id}`, m);
  const manifest = emptyManifest({ name: "t" });

  let current: Selections = { ...selections };
  for (;;) {
    const pending: Partial<Record<CategoryId, ModuleMetadata>> = {};
    for (const c of PEER_CATEGORIES) {
      const id = current[c]?.[0];
      if (!id) continue;
      const mod = byKey.get(`${c}:${id}`);
      if (mod) pending[c] = mod;
    }
    let removed = false;
    const next: Selections = {};
    for (const category of KNOWN_CATEGORIES) {
      const ids = current[category];
      if (!ids?.length) continue;
      const kept: string[] = [];
      for (const id of ids) {
        const mod = byKey.get(`${category}:${id}`);
        if (!mod) {
          removed = true;
          continue;
        }
        if (resolveAdapter(mod, { manifest, pending }).ok) kept.push(id);
        else removed = true;
      }
      if (kept.length > 0) next[category] = kept;
    }
    current = next;
    // Removing one entry can orphan another (a peer chain); loop until stable.
    if (!removed) return next;
  }
}

/**
 * Default app list for the web builder. Single-app today (matches what
 * `stanza init` produces); multi-app builder UX is a planned follow-up.
 */
export const DEFAULT_BUILDER_APPS: readonly AppSpec[] = [defaultWebApp()];

/**
 * Build the `<pm> create stanza` command from the current state. npm needs a
 * `--` separator to forward flags; pnpm/bun pass them through directly.
 */
export function buildCommand(input: {
  name: string;
  selections: Selections;
  pm?: PackageManager;
}): string {
  const pm = input.pm ?? "pnpm";
  const command = pm === "npm" ? "init" : "create";
  const flags = categoryOrder
    .map((category) => {
      const ids = input.selections[category];
      return ids && ids.length > 0 ? `--${category}=${ids.join(",")}` : null;
    })
    .filter((s): s is string => Boolean(s));
  const base = `${pm} ${command} stanza ${input.name}`;
  if (flags.length === 0) return base;
  const separator = pm === "npm" ? " -- " : " ";
  return `${base}${separator}${flags.join(" ")}`;
}
