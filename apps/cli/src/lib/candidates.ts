import { resolveAdapter, type ResolveError } from "@withstanza/registry";
import type {
  AppKind,
  CategoryId,
  Module,
  RegistryIndex,
  StanzaManifest,
} from "@withstanza/schema";
import { categoryLabel } from "@withstanza/schema";

/**
 * A module in a category, tagged with whether it can be installed against the
 * current stack. `compatible: false` carries a terse `reason` suitable for an
 * inline disabled-option hint (e.g. clack's `Option.hint`). Shared by the
 * `init` wizard (which filters to `compatible`) and the `add`/`remove` pickers
 * (which render the incompatible ones as disabled).
 */
export type Candidate = {
  namespace: string;
  entry: RegistryIndex["modules"][number];
  /** Installable against the current manifest + pending picks + target app. */
  compatible: boolean;
  /** Terse disabled-hint text; present only when `compatible` is false. */
  reason?: string;
};

/**
 * List every module in `category` across the given indices, peer-checked
 * against the manifest (plus any in-flight `pending` picks) and the target app.
 * A module is incompatible when its peers aren't satisfied, its `appKind`
 * doesn't match the target app, or it's already installed (`installedIds`).
 */
export function categoryCandidates(args: {
  indices: { namespace: string; index: RegistryIndex }[];
  category: CategoryId;
  manifest: StanzaManifest;
  pending?: Partial<Record<CategoryId, Module>>;
  targetAppId?: string;
  targetAppKind?: AppKind;
  installedIds?: ReadonlySet<string>;
}): Candidate[] {
  const {
    indices,
    category,
    manifest,
    pending = {},
    targetAppId,
    targetAppKind,
    installedIds,
  } = args;
  const out: Candidate[] = [];
  for (const { namespace, index } of indices) {
    for (const entry of index.modules) {
      if (entry.category !== category) continue;

      // Definitive states first: an already-installed id, then an app-kind
      // mismatch (a native framework can't go into a web app). Either makes the
      // peer check moot, and the more specific reason is the more useful hint.
      if (installedIds?.has(entry.id)) {
        out.push({ namespace, entry, compatible: false, reason: "already added" });
        continue;
      }
      if (targetAppKind && entry.appKind && entry.appKind !== targetAppKind) {
        out.push({
          namespace,
          entry,
          compatible: false,
          reason: `needs a ${entry.appKind} app`,
        });
        continue;
      }

      // Peer resolution. The index entry carries summary adapters (key + match)
      // — enough for the resolver's peer check. Mirror `add`'s synthetic shape.
      const synthetic = { ...entry, adapters: entry.adapters.map((a) => ({ ...a })) } as Module;
      const result = resolveAdapter(synthetic, { manifest, pending, targetAppId });
      if (result.ok) {
        out.push({ namespace, entry, compatible: true });
      } else {
        out.push({ namespace, entry, compatible: false, reason: reasonForError(result.error) });
      }
    }
  }
  return out;
}

/** Map a resolver error to a terse, user-facing disabled-hint phrase. */
function reasonForError(error: ResolveError): string {
  if (error.kind === "missing-peer") {
    return `add a ${categoryLabel(error.category).toLowerCase()} first`;
  }
  if (error.kind === "incompatible-peer") return `incompatible with ${error.peer}`;
  return "no adapter for your stack";
}
