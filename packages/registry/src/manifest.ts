import { z } from "zod";

import {
  APP_KINDS,
  type AppKind,
  type CategoryId,
  KNOWN_CATEGORIES,
  type ModuleId,
} from "./module";

export const CURRENT_MANIFEST_VERSION = "0.3" as const;

/** Canonical public URL of the published `stanza.json` JSON Schema. */
export const MANIFEST_SCHEMA_URL = "https://stanza.tools/schema.json";

/**
 * An app inside the monorepo. The `id` doubles as the workspace-package suffix
 * (`@<manifest.name>/<id>`), the URL/CLI handle (`--app=<id>`), and the key
 * module records use in their `apps` field. `dir` is repo-relative; `kind`
 * determines which framework modules can install into it.
 */
export type AppSpec = {
  id: string;
  dir: string;
  kind: AppKind;
};

export type StanzaModuleRecord = {
  id: ModuleId;
  /**
   * Pinned module version at install time. Recorded now so the upcoming
   * `swap` and `update` verbs can read it; not consumed yet.
   */
  version: string;
  /** Adapter key chosen at install time (function of peer categories). */
  adapter: string;
  /**
   * Which apps this install targets, by `AppSpec.id`. Semantics depend on the
   * module's category `home`:
   *
   *  - `home: "app"`     — **required** (length ≥ 1). For single-cardinality
   *    categories there is ≤ 1 record per app id; multi-cardinality categories
   *    can hold multiple records per app.
   *  - `home: "package"` — optional. Omitted means "ship app-scoped shims
   *    into every app"; an explicit list restricts which apps receive shims.
   *    The package itself is always written once at `packages/<dir>/`.
   *  - `home: "repo"`    — must be omitted. Repo-home modules are project-wide.
   */
  apps?: string[];
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
  /**
   * Apps in the monorepo. Length ≥ 1. The init wizard ships a single web app
   * today; multi-app init is a planned follow-up but the schema is ready.
   */
  apps: AppSpec[];
  /**
   * Installed modules, keyed by category. Each category holds an array;
   * cardinality is enforced **per app** for `home: "app"` categories
   * (≤ 1 record per app id when `cardinality: "one"`) and **per project**
   * for the rest.
   */
  modules: Partial<Record<CategoryId, StanzaModuleRecord[]>>;
  regions: RegionOwnership;
  /**
   * SHA-256 of the README.md Stanza last wrote. When `stanza add`/`remove`
   * regenerate the README they compare the current file's hash against this
   * value — a mismatch means the user edited it, and the refresh is skipped.
   * Absent on legacy manifests; treated as "user-owned" in that case.
   */
  readmeChecksum?: string;
};

const appSpecSchema = z.object({
  id: z.string(),
  dir: z.string(),
  kind: z.enum(APP_KINDS),
}) satisfies z.ZodType<AppSpec>;

export const StanzaManifestSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(CURRENT_MANIFEST_VERSION),
  projectShape: z.literal("monorepo"),
  packageManager: z.enum(["pnpm", "bun", "npm"]),
  name: z.string(),
  apps: z.array(appSpecSchema).min(1),
  // Zod 4: partialRecord because not every category is filled. Every category
  // holds an array (single-choice categories carry 0 or 1 records per app).
  modules: z.partialRecord(
    z.enum(KNOWN_CATEGORIES),
    z.array(
      z.object({
        id: z.string(),
        version: z.string(),
        adapter: z.string(),
        apps: z.array(z.string()).optional(),
      }),
    ),
  ),
  regions: z.record(z.string(), z.record(z.string(), z.string())),
  readmeChecksum: z.string().optional(),
}) satisfies z.ZodType<StanzaManifest>;

/**
 * Built-in default app: a single web app at `apps/web` with id `"web"`. The
 * init wizard hands this back today; once multi-app init lands, callers can
 * pass a custom `apps` array to `emptyManifest`.
 */
export function defaultWebApp(): AppSpec {
  return { id: "web", dir: "apps/web", kind: "web" };
}

export function emptyManifest(input: {
  name: string;
  apps?: AppSpec[];
  packageManager?: StanzaManifest["packageManager"];
}): StanzaManifest {
  return {
    $schema: MANIFEST_SCHEMA_URL,
    version: CURRENT_MANIFEST_VERSION,
    projectShape: "monorepo",
    packageManager: input.packageManager ?? "pnpm",
    name: input.name,
    apps: input.apps && input.apps.length > 0 ? input.apps : [defaultWebApp()],
    modules: {},
    regions: {},
  };
}

/** Find an app by id; throws when missing (caller is misusing the helper). */
export function getApp(manifest: StanzaManifest, id: string): AppSpec {
  const app = manifest.apps.find((a) => a.id === id);
  if (!app) {
    throw new Error(
      `No app "${id}" in manifest. Available: ${manifest.apps.map((a) => a.id).join(", ")}.`,
    );
  }
  return app;
}

/**
 * Resolve a module record's targeted apps. Empty/undefined `apps` means
 * "every app in the manifest" — used for package-home modules whose shims
 * should ship into all consumers by default.
 */
export function appsForRecord(manifest: StanzaManifest, record: StanzaModuleRecord): AppSpec[] {
  if (!record.apps?.length) return manifest.apps;
  return record.apps.map((id) => getApp(manifest, id));
}

/**
 * The single installed record for a category, or `undefined`. When `appId`
 * is given, filters to records that target that app (or are global — `apps`
 * omitted). For `cardinality: "one"` categories.
 */
export function selectedOne(
  manifest: StanzaManifest,
  category: CategoryId,
  appId?: string,
): StanzaModuleRecord | undefined {
  const records = manifest.modules[category] ?? [];
  if (appId === undefined) return records[0];
  return records.find((r) => !r.apps || r.apps.includes(appId));
}

/**
 * All installed records for a category (empty when none). When `appId` is
 * given, filters to records that target that app (or are global).
 */
export function selectedAll(
  manifest: StanzaManifest,
  category: CategoryId,
  appId?: string,
): StanzaModuleRecord[] {
  const records = manifest.modules[category] ?? [];
  if (appId === undefined) return records;
  return records.filter((r) => !r.apps || r.apps.includes(appId));
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
