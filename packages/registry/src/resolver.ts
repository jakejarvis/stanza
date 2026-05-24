import { type StanzaManifest, selectedOne } from "./manifest";
import {
  type CategoryId,
  KNOWN_CATEGORIES,
  type Module,
  type ModuleAdapter,
  PEER_CATEGORIES,
} from "./module";

/**
 * Topological order categories are processed in (derived from `CATEGORIES`):
 * a category appears after every category it can peer on, and `many` (leaf)
 * categories come last.
 */
export const categoryOrder: readonly CategoryId[] = KNOWN_CATEGORIES;

export type ResolveContext = {
  /** Manifest state at the moment of resolution (post any pending picks). */
  manifest: StanzaManifest;
  /** Modules the user has already chosen this run but not yet committed. */
  pending: Partial<Record<CategoryId, Module>>;
  /**
   * App being targeted by this resolution. When set, peer lookups for
   * single-cardinality categories scope to records whose `apps` include this
   * id (or are global — `apps` omitted). When unset, peer lookups read the
   * global category state — fine for single-app projects and repo-home
   * modules that don't care which app drove the resolution.
   */
  targetAppId?: string;
};

export type ResolveError =
  | { kind: "no-adapter"; module: Module; peers: Partial<Record<CategoryId, string>> }
  | { kind: "missing-peer"; module: Module; category: CategoryId }
  | { kind: "incompatible-peer"; module: Module; category: CategoryId; peer: string };

export type ResolveResult =
  | { ok: true; adapter: ModuleAdapter }
  | { ok: false; error: ResolveError };

/**
 * Pick the most-specific adapter that matches the active peer choices.
 *
 * Specificity = number of `match` keys satisfied. The default (empty `match`)
 * always wins on tiebreak when no peers are required.
 */
export function resolveAdapter(module: Module, context: ResolveContext): ResolveResult {
  const activePeers = activePeerIds(context);

  // Check declared peers are satisfied (id present + on allow-list if specified).
  for (const category of PEER_CATEGORIES) {
    const allowed = module.peers?.[category];
    if (allowed === undefined) continue;
    const chosen = activePeers[category];
    if (!chosen) {
      return { ok: false, error: { kind: "missing-peer", module, category } };
    }
    if (allowed !== "any" && !allowed.includes(chosen)) {
      return {
        ok: false,
        error: { kind: "incompatible-peer", module, category, peer: chosen },
      };
    }
  }

  const candidates = module.adapters
    .map((adapter) => ({
      adapter,
      specificity: matchSpecificity(adapter, activePeers),
    }))
    .filter((c) => c.specificity >= 0);

  if (candidates.length === 0) {
    return {
      ok: false,
      error: { kind: "no-adapter", module, peers: activePeers },
    };
  }

  candidates.sort((a, b) => b.specificity - a.specificity);
  // Non-null asserted: candidates.length > 0 was just checked above.
  return { ok: true, adapter: candidates[0]!.adapter };
}

export function isCompatible(module: Module, context: ResolveContext): boolean {
  return resolveAdapter(module, context).ok;
}

/**
 * Active peer ids — only `cardinality: "one"` categories can be peers, so we
 * iterate `PEER_CATEGORIES` and read the single installed/pending pick. When
 * `targetAppId` is set, the installed lookup is scoped to that app so e.g.
 * web's styling adapter peer-matches against web's framework, not native's.
 * Pending picks aren't yet app-scoped — they belong to the same in-flight
 * resolution and only one app is being processed at a time.
 */
function activePeerIds(context: ResolveContext): Partial<Record<CategoryId, string>> {
  const out: Partial<Record<CategoryId, string>> = {};
  for (const category of PEER_CATEGORIES) {
    const pending = context.pending[category]?.id;
    const installed = selectedOne(context.manifest, category, context.targetAppId)?.id;
    const chosen = pending ?? installed;
    if (chosen) out[category] = chosen;
  }
  return out;
}

/**
 * Returns -1 if the adapter is impossible (declares a peer match the active
 * peers contradict). Otherwise the number of matched constraints. Adapters with
 * an empty `match` are universally applicable (specificity 0).
 */
function matchSpecificity(
  adapter: ModuleAdapter,
  peers: Partial<Record<CategoryId, string>>,
): number {
  let score = 0;
  for (const category of KNOWN_CATEGORIES) {
    const required = adapter.match[category];
    if (required === undefined) continue;
    if (peers[category] !== required) return -1;
    score += 1;
  }
  return score;
}
