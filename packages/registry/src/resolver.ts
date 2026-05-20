import type { StanzaManifest } from "./manifest.ts";
import { KNOWN_SLOTS, type Module, type ModuleAdapter, type SlotId } from "./module.ts";

/**
 * Topological order slots are processed in. Earlier slots become peer
 * candidates for later ones. Hardcoded for now since the dependency graph
 * is small and fixed; can be derived from peer declarations later.
 */
export const slotOrder: readonly SlotId[] = ["framework", "styling", "db", "orm", "auth"];

export type ResolveContext = {
  /** Manifest state at the moment of resolution (post any pending picks). */
  manifest: StanzaManifest;
  /** Modules the user has already chosen this run but not yet committed. */
  pending: Partial<Record<SlotId, Module>>;
};

export type ResolveError =
  | { kind: "no-adapter"; module: Module; peers: Partial<Record<SlotId, string>> }
  | { kind: "missing-peer"; module: Module; slot: SlotId }
  | { kind: "incompatible-peer"; module: Module; slot: SlotId; peer: string };

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
  for (const slot of KNOWN_SLOTS) {
    const allowed = module.peers?.[slot];
    if (allowed === undefined) continue;
    const chosen = activePeers[slot];
    if (!chosen) {
      return { ok: false, error: { kind: "missing-peer", module, slot } };
    }
    if (allowed !== "any" && !allowed.includes(chosen)) {
      return {
        ok: false,
        error: { kind: "incompatible-peer", module, slot, peer: chosen },
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

function activePeerIds(context: ResolveContext): Partial<Record<SlotId, string>> {
  const out: Partial<Record<SlotId, string>> = {};
  for (const slot of KNOWN_SLOTS) {
    const pending = context.pending[slot]?.id;
    const installed = context.manifest.modules[slot]?.id;
    const chosen = pending ?? installed;
    if (chosen) out[slot] = chosen;
  }
  return out;
}

/**
 * Returns -1 if the adapter is impossible (declares a peer match the active
 * peers contradict). Otherwise returns the number of matched constraints.
 * Adapters with an empty `match` map are universally applicable (specificity 0).
 */
function matchSpecificity(adapter: ModuleAdapter, peers: Partial<Record<SlotId, string>>): number {
  let score = 0;
  for (const [slot, required] of Object.entries(adapter.match) as [SlotId, string][]) {
    const actual = peers[slot];
    if (actual !== required) return -1;
    score += 1;
  }
  return score;
}
