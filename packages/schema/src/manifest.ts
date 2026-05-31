import { z } from "zod";

import {
  APP_KINDS,
  type AppKind,
  categoryCardinality,
  categoryHome,
  type CategoryId,
  KNOWN_CATEGORIES,
  type ModuleId,
} from "./category";
import { type PackageManager, PackageManagerSchema } from "./package-manager";
import { type RegistryConfig, RegistriesSchema } from "./registry-config";

export const CURRENT_MANIFEST_VERSION = "0.4" as const;

/**
 * Past schema versions a new CLI can still read. Since each bump so far has
 * only added optional fields, older manifests parse cleanly under the current
 * schema — `readManifest` re-stamps the version to {@link CURRENT_MANIFEST_VERSION}
 * on load so the in-memory object is always current, and the next write
 * persists the upgrade. Add prior versions here as the schema evolves.
 */
export const SUPPORTED_MANIFEST_VERSIONS = ["0.3", "0.4"] as const;

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
  /**
   * Namespace this module was installed from, e.g. `"@acme"`. Omitted means
   * the default first-party namespace (`"@stanza"`). `stanza remove` and the
   * upcoming `update`/`swap` verbs read this to refetch from the original
   * registry.
   */
  namespace?: string;
  /**
   * Snapshot of the codemod invocations the adapter ran. `stanza remove`
   * reads these to drive reverts so the operation works even if the upstream
   * registry has since renamed the adapter or its codemod list.
   */
  codemods?: Array<{ id: string; args?: Record<string, unknown> }>;
  /** Module-level `consumesPackages`, snapshotted so revert can rebuild a render context offline. */
  consumesPackages?: string[];
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
  /**
   * Schema version of this manifest. Always {@link CURRENT_MANIFEST_VERSION}
   * on write — {@link SUPPORTED_MANIFEST_VERSIONS} lists the prior versions
   * the reader still accepts, which get re-stamped to the current version
   * on the next save.
   */
  version: (typeof SUPPORTED_MANIFEST_VERSIONS)[number];
  projectShape: "monorepo";
  packageManager: PackageManager;
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
   * Third-party module registries. Keys are namespace strings (e.g. `"@acme"`);
   * values are either a URL prefix (Stanza's default layout) or a full
   * `RegistryConfig` with URL template, headers, and params. Modules from
   * these registries are addressed as `<category> @<ns>/<id>` on the CLI;
   * the `@stanza` default namespace is bundled in the CLI and cannot be
   * redeclared here (override its URL via the `STANZA_REGISTRY` env var).
   */
  registries?: Record<string, RegistryConfig>;
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

export const StanzaManifestSchema = z
  .object({
    $schema: z.string().optional(),
    // Accept past versions on read (schema is purely additive so far); the
    // CLI re-stamps to CURRENT_MANIFEST_VERSION on the next write.
    version: z.enum(SUPPORTED_MANIFEST_VERSIONS),
    projectShape: z.literal("monorepo"),
    packageManager: PackageManagerSchema,
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
          namespace: z.string().optional(),
          codemods: z
            .array(
              z.object({
                id: z.string(),
                args: z.record(z.string(), z.unknown()).optional(),
              }),
            )
            .optional(),
          consumesPackages: z.array(z.string()).optional(),
        }),
      ),
    ),
    regions: z.record(z.string(), z.record(z.string(), z.string())),
    registries: RegistriesSchema.optional(),
    readmeChecksum: z.string().optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    // The CLI enforces cardinality at apply-time; this catches hand-edited or
    // third-party-synthesized manifests so `selectedOne` callers can rely on it.
    const appIds = m.apps.map((a) => a.id);
    for (const category of KNOWN_CATEGORIES) {
      const records = m.modules[category];
      if (!records || categoryCardinality(category) !== "one") continue;
      if (categoryHome(category).kind === "app") {
        const counts = new Map<string, number>();
        for (const r of records) {
          const targets = r.apps?.length ? r.apps : appIds;
          for (const id of targets) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        for (const [id, count] of counts) {
          if (count > 1) {
            ctx.addIssue({
              code: "custom",
              message: `Category "${category}" allows ≤ 1 module per app, but app "${id}" has ${count}.`,
              path: ["modules", category],
            });
          }
        }
      } else if (records.length > 1) {
        ctx.addIssue({
          code: "custom",
          message: `Category "${category}" allows ≤ 1 module per project, found ${records.length}.`,
          path: ["modules", category],
        });
      }
    }
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
  packageManager?: PackageManager;
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
 * Sorted, deduped list of env var names every installed module has claimed in
 * `.env.example` — the same set that ends up in the file. Backs the `{{env}}`
 * render context entry (and, transitively, `monorepo-turbo`'s `globalEnv` so
 * Turborepo's task hashes track the right variables).
 *
 * Returns `[]` when nothing has been claimed yet (fresh init, or a project
 * with no env-declaring modules).
 */
export function declaredEnvNames(manifest: StanzaManifest): string[] {
  const envRegions = manifest.regions[".env.example"];
  if (!envRegions) return [];
  return Object.keys(envRegions).toSorted();
}
