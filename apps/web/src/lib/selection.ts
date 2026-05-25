import type {
  AppSpec,
  CategoryId,
  InstallHome,
  Module,
  Resolved,
  ResolvedEntry,
  TemplateRef,
} from "@stanza/registry";
import {
  categoryHome,
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
      const ids = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
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
function pendingPeers(
  modules: Record<string, Module>,
  selections: Selections,
): Partial<Record<CategoryId, Module>> {
  const pending: Partial<Record<CategoryId, Module>> = {};
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
 */
export function pruneUnresolved(
  modules: Record<string, Module>,
  selections: Selections,
): Selections {
  let current: Selections = { ...selections };
  for (;;) {
    const resolved = resolveSelected(modules, current);
    let removed = false;
    const next: Selections = {};
    for (const category of KNOWN_CATEGORIES) {
      const ids = current[category];
      if (!ids?.length) continue;
      const okIds = new Set((resolved[category] ?? []).map((e) => e.module.id));
      const kept = ids.filter((id) => okIds.has(id));
      if (kept.length !== ids.length) removed = true;
      if (kept.length > 0) next[category] = kept;
    }
    current = next;
    // Removing one entry can orphan another (a peer chain); loop until stable.
    if (!removed) return next;
  }
}

export type SelectedFile = {
  path: string;
  template: TemplateRef;
  owner: { category: CategoryId; module: string };
};

/**
 * Default app list for the web builder. Single-app today (matches what
 * `stanza init` produces); multi-app builder UX is a planned follow-up.
 */
export const DEFAULT_BUILDER_APPS: readonly AppSpec[] = [defaultWebApp()];

/**
 * Derive the full file list stanza will write for the current selection.
 * Mirrors codemod-runner's resolution via `categoryHome`:
 *  - repo → repo root · app → each app's dir · package → `packages/<dir>/`.
 * Categories are emitted in `categoryOrder`. Each `scope: "app"` template
 * emits once per app in `apps` (the builder defaults to a single web app).
 */
export function selectedFiles(
  resolved: Resolved,
  apps: readonly AppSpec[] = DEFAULT_BUILDER_APPS,
): SelectedFile[] {
  const out: SelectedFile[] = [];
  for (const category of categoryOrder) {
    const home = categoryHome(category);
    for (const entry of resolved[category] ?? []) {
      for (const tpl of entry.adapter.templates ?? []) {
        if (tpl.scope === "app") {
          for (const app of apps) {
            out.push({
              path: resolveTemplatePath(tpl, home, app),
              template: tpl,
              owner: { category, module: entry.module.id },
            });
          }
          continue;
        }
        out.push({
          path: resolveTemplatePath(tpl, home, apps[0]!),
          template: tpl,
          owner: { category, module: entry.module.id },
        });
      }
    }
  }
  return out;
}

function resolveTemplatePath(tpl: TemplateRef, home: InstallHome, app: AppSpec): string {
  if (tpl.scope === "repo") return tpl.dest;
  if (tpl.scope === "package") {
    // Defensive: if a module declares `scope: "package"` for a non-package home,
    // the CLI runner would error; the preview just falls back to repo root.
    return home.kind === "package" ? `packages/${home.dir}/${tpl.dest}` : tpl.dest;
  }
  return `${app.dir.replace(/\/$/, "")}/${tpl.dest}`;
}

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
  const flags = categoryOrder
    .map((category) => {
      const ids = input.selections[category];
      return ids && ids.length > 0 ? `--${category}=${ids.join(",")}` : null;
    })
    .filter((s): s is string => Boolean(s));
  const base = `${pm} create stanza ${input.name}`;
  if (flags.length === 0) return base;
  const separator = pm === "npm" ? " -- " : " ";
  return `${base}${separator}${flags.join(" ")}`;
}
