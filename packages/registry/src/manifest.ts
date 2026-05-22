import { z } from "zod";

import { type CategoryId, KNOWN_CATEGORIES, type ModuleId } from "./module";

export const CURRENT_MANIFEST_VERSION = "0.2" as const;

/** Canonical public URL of the published `stanza.json` JSON Schema. */
export const MANIFEST_SCHEMA_URL = "https://stanza.tools/schema.json";

export type StanzaModuleRecord = {
  id: ModuleId;
  /**
   * Pinned module version at install time. Recorded now so the upcoming
   * `swap` and `update` verbs can read it; not consumed yet.
   */
  version: string;
  /** Adapter key chosen at install time (function of peer categories). */
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
  /** Editor-facing pointer to the published JSON Schema. */
  $schema?: string;
  version: typeof CURRENT_MANIFEST_VERSION;
  projectShape: "monorepo";
  packageManager: "pnpm" | "bun" | "npm";
  /** Display name; usually the repo root name. */
  name: string;
  /** Path of the primary web/native app inside the monorepo. */
  appDir: string;
  /**
   * Installed modules, keyed by category. Each category holds an array;
   * `cardinality: "one"` categories are enforced to length ≤ 1 at install time.
   */
  modules: Partial<Record<CategoryId, StanzaModuleRecord[]>>;
  regions: RegionOwnership;
};

export const StanzaManifestSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(CURRENT_MANIFEST_VERSION),
  projectShape: z.literal("monorepo"),
  packageManager: z.enum(["pnpm", "bun", "npm"]),
  name: z.string(),
  appDir: z.string(),
  // Zod 4: partialRecord because not every category is filled. Every category
  // holds an array (single-choice categories carry 0 or 1 records).
  modules: z.partialRecord(
    z.enum(KNOWN_CATEGORIES),
    z.array(
      z.object({
        id: z.string(),
        version: z.string(),
        adapter: z.string(),
      }),
    ),
  ),
  regions: z.record(z.string(), z.record(z.string(), z.string())),
}) satisfies z.ZodType<StanzaManifest>;

export function emptyManifest(input: {
  name: string;
  appDir?: string;
  packageManager?: StanzaManifest["packageManager"];
}): StanzaManifest {
  return {
    $schema: MANIFEST_SCHEMA_URL,
    version: CURRENT_MANIFEST_VERSION,
    projectShape: "monorepo",
    packageManager: input.packageManager ?? "pnpm",
    name: input.name,
    appDir: input.appDir ?? "apps/web",
    modules: {},
    regions: {},
  };
}

/** The single installed record for a category, or `undefined`. For `cardinality: "one"`. */
export function selectedOne(
  manifest: StanzaManifest,
  category: CategoryId,
): StanzaModuleRecord | undefined {
  return manifest.modules[category]?.[0];
}

/** All installed records for a category (empty when none). */
export function selectedAll(manifest: StanzaManifest, category: CategoryId): StanzaModuleRecord[] {
  return manifest.modules[category] ?? [];
}

/**
 * JSON Schema for `stanza.json`, derived from the single Zod source of truth.
 * Published at {@link MANIFEST_SCHEMA_URL} so editors can validate and
 * autocomplete the manifest.
 */
export function manifestJsonSchema(): Record<string, unknown> {
  return {
    $id: MANIFEST_SCHEMA_URL,
    title: "Stanza manifest",
    description: "Schema for stanza.json — a Stanza monorepo manifest.",
    ...z.toJSONSchema(StanzaManifestSchema),
  };
}
