import { type StanzaManifest, selectedOne } from "./manifest";
import {
  type CategoryId,
  KNOWN_CATEGORIES,
  type ModuleAdapter,
  PEER_CATEGORIES,
  type PeerRequirement,
} from "./module";

/**
 * Topological order categories are processed in (derived from `CATEGORIES`):
 * a category appears after every category it can peer on, and `many` (leaf)
 * categories come last.
 */
export const categoryOrder: readonly CategoryId[] = KNOWN_CATEGORIES;

/**
 * Minimum shape `resolveAdapter` reads. Both full `Module` and the lighter
 * `ModuleMetadata` satisfy this — the web builder ships only metadata to the
 * client, the CLI passes full Modules. The generic preserves the adapter type
 * end-to-end so each caller gets back the same shape it put in.
 */
export type Resolvable<A extends Pick<ModuleAdapter, "key" | "match">> = {
  id: string;
  peers?: PeerRequirement;
  adapters: A[];
};

export type ResolveContext = {
  /** Manifest state at the moment of resolution (post any pending picks). */
  manifest: StanzaManifest;
  /** Modules the user has already chosen this run but not yet committed. */
  pending: Partial<Record<CategoryId, { id: string }>>;
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
  | { kind: "no-adapter"; peers: Partial<Record<CategoryId, string>> }
  | { kind: "missing-peer"; category: CategoryId }
  | { kind: "incompatible-peer"; category: CategoryId; peer: string };

export type ResolveResult<A extends Pick<ModuleAdapter, "key" | "match">> =
  | { ok: true; adapter: A }
  | { ok: false; error: ResolveError };

/**
 * Pick the most-specific adapter that matches the active peer choices.
 *
 * Specificity = number of `match` keys satisfied. The default (empty `match`)
 * always wins on tiebreak when no peers are required.
 */
export function resolveAdapter<A extends Pick<ModuleAdapter, "key" | "match">>(
  module: Resolvable<A>,
  context: ResolveContext,
): ResolveResult<A> {
  const activePeers = activePeerIdsForContext(context);

  // Check declared peers are satisfied (id present + on allow-list if specified).
  for (const category of PEER_CATEGORIES) {
    const allowed = module.peers?.[category];
    if (allowed === undefined) continue;
    const chosen = activePeers[category];
    if (!chosen) {
      return { ok: false, error: { kind: "missing-peer", category } };
    }
    if (allowed !== "any" && !allowed.includes(chosen)) {
      return {
        ok: false,
        error: { kind: "incompatible-peer", category, peer: chosen },
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
      error: { kind: "no-adapter", peers: activePeers },
    };
  }

  candidates.sort((a, b) => b.specificity - a.specificity);
  // Non-null asserted: candidates.length > 0 was just checked above.
  return { ok: true, adapter: candidates[0]!.adapter };
}

export function isCompatible<A extends Pick<ModuleAdapter, "key" | "match">>(
  module: Resolvable<A>,
  context: ResolveContext,
): boolean {
  return resolveAdapter(module, context).ok;
}

/**
 * Active peer ids from the manifest alone — only `cardinality: "one"`
 * categories can be peers, so we iterate `PEER_CATEGORIES` and read the
 * single installed pick. When `targetAppId` is set, the lookup is scoped to
 * that app so e.g. web's ui adapter peer-matches against web's
 * framework, not native's.
 *
 * Exported so callers outside the resolver (the CLI runner and web
 * synthesize, which both feed peers into the template render context) share
 * exactly one implementation.
 */
export function activePeerIds(
  manifest: StanzaManifest,
  targetAppId?: string,
): Partial<Record<CategoryId, string>> {
  const out: Partial<Record<CategoryId, string>> = {};
  for (const category of PEER_CATEGORIES) {
    const installed = selectedOne(manifest, category, targetAppId)?.id;
    if (installed) out[category] = installed;
  }
  return out;
}

/**
 * Layer in-flight `pending` picks over the manifest's installed peers.
 * Pending picks aren't yet app-scoped — they belong to the same in-flight
 * resolution and only one app is being processed at a time.
 */
function activePeerIdsForContext(context: ResolveContext): Partial<Record<CategoryId, string>> {
  const installed = activePeerIds(context.manifest, context.targetAppId);
  const out: Partial<Record<CategoryId, string>> = { ...installed };
  for (const category of PEER_CATEGORIES) {
    const pending = context.pending[category]?.id;
    if (pending) out[category] = pending;
  }
  return out;
}

/**
 * Returns -1 if the adapter is impossible (declares a peer match the active
 * peers contradict). Otherwise the number of matched constraints. Adapters with
 * an empty `match` are universally applicable (specificity 0).
 */
function matchSpecificity(
  adapter: Pick<ModuleAdapter, "match">,
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
