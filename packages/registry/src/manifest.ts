import { z } from "zod";

import { KNOWN_SLOTS, type ModuleId, type SlotId } from "./module.ts";

export const CURRENT_MANIFEST_VERSION = "0.1" as const;

export type StanzaModuleRecord = {
  id: ModuleId;
  /**
   * Pinned module version at install time. Recorded now so the upcoming
   * `swap` and `update` verbs can read it; not consumed yet.
   */
  version: string;
  /** Adapter key chosen at install time (function of peer slots). */
  adapter: string;
};

/**
 * Per-file region ownership. Keys are dot-paths inside the file
 * (e.g. "imports", "providers", "dependencies.better-auth"). Values are
 * the owning module id. Written today; the `swap`/`update` verbs (and the
 * deeper `remove` reversal) will use it to scope codemods back to the
 * regions a single module owns.
 */
export type RegionMap = Record<string, ModuleId>;
export type RegionOwnership = Record<string, RegionMap>;

export type StanzaManifest = {
  version: typeof CURRENT_MANIFEST_VERSION;
  projectShape: "monorepo";
  packageManager: "pnpm" | "bun" | "npm";
  /** Display name; usually the repo root name. */
  name: string;
  /** Path of the primary web/native app inside the monorepo. */
  appDir: string;
  modules: Partial<Record<SlotId, StanzaModuleRecord>>;
  regions: RegionOwnership;
  /** Anonymous client id used by opt-out telemetry. Stored to dedupe events. */
  telemetryId?: string;
};

export const StanzaManifestSchema = z.object({
  version: z.literal(CURRENT_MANIFEST_VERSION),
  projectShape: z.literal("monorepo"),
  packageManager: z.enum(["pnpm", "bun", "npm"]),
  name: z.string(),
  appDir: z.string(),
  // Zod 4: `z.record` over a finite key type requires all keys to be present.
  // We want partial — not every slot needs to be filled — so use partialRecord.
  modules: z.partialRecord(
    z.enum(KNOWN_SLOTS),
    z.object({
      id: z.string(),
      version: z.string(),
      adapter: z.string(),
    }),
  ),
  regions: z.record(z.string(), z.record(z.string(), z.string())),
  telemetryId: z.string().optional(),
}) satisfies z.ZodType<StanzaManifest>;

export function emptyManifest(input: {
  name: string;
  appDir?: string;
  packageManager?: StanzaManifest["packageManager"];
}): StanzaManifest {
  return {
    version: CURRENT_MANIFEST_VERSION,
    projectShape: "monorepo",
    packageManager: input.packageManager ?? "pnpm",
    name: input.name,
    appDir: input.appDir ?? "apps/web",
    modules: {},
    regions: {},
  };
}
