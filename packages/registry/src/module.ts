import { z } from "zod";

/**
 * Ordered tuple of legal slot ids. The order is topological — earlier slots
 * become peer candidates for later ones. The `as const` is load-bearing:
 * Zod's `z.enum(KNOWN_SLOTS)` uses the literal-tuple type to produce a
 * properly-narrowed schema.
 *
 * Keep this in sync with `SLOTS` below. TypeScript will fail to typecheck
 * `SLOTS` if any entry's id is outside this tuple.
 */
export const KNOWN_SLOTS = ["framework", "styling", "db", "orm", "auth"] as const;

export type SlotId = (typeof KNOWN_SLOTS)[number];

export type Slot = {
  id: SlotId;
  label: string;
  description: string;
  /**
   * Internal-package directory under `packages/` for slot-package extraction.
   *  - `null` — files land in the active app dir (`manifest.appDir`). Use for
   *    slots that wire the app shell itself (framework, styling).
   *  - A string — files land in `packages/<dir>/`, named `@<manifest.name>/<dir>`,
   *    and the app gets a `workspace:*` dep. Many-to-one is intentional: `db`
   *    and `orm` share `packages/db/` so the ORM client sits next to the schema.
   */
  packageDir: string | null;
};

/**
 * Single source of truth for slot metadata. Adding a new slot is a two-line
 * edit: append the id to `KNOWN_SLOTS` and append a `Slot` here. Iteration
 * order matches `KNOWN_SLOTS` (also the processing order).
 */
export const SLOTS: readonly Slot[] = [
  {
    id: "framework",
    label: "Framework",
    description: "Web/native app framework.",
    packageDir: null,
  },
  {
    id: "styling",
    label: "Styling",
    description: "CSS / styling system.",
    packageDir: null,
  },
  {
    id: "db",
    label: "Database",
    description: "Database engine.",
    packageDir: "db",
  },
  {
    id: "orm",
    label: "ORM",
    description: "Database query layer.",
    packageDir: "db",
  },
  {
    id: "auth",
    label: "Auth",
    description: "Authentication provider.",
    packageDir: "auth",
  },
];

/**
 * Lookup form of slot → package dir. Equivalent to finding the slot in
 * `SLOTS` but cheaper at hot paths and the call shape consumers expect.
 */
export const SLOT_PACKAGE_DIR: Record<SlotId, string | null> = Object.fromEntries(
  SLOTS.map((s) => [s.id, s.packageDir]),
) as Record<SlotId, string | null>;

const SLOT_BY_ID: Record<SlotId, Slot> = Object.fromEntries(SLOTS.map((s) => [s.id, s])) as Record<
  SlotId,
  Slot
>;

/** Display name for a slot — used by the wizard, summary, and CLI list output. */
export function slotLabel(slot: SlotId): string {
  return SLOT_BY_ID[slot].label;
}

export type ModuleId = string;

export type PeerRequirement = {
  [K in SlotId]?: ModuleId[] | "any";
};

/**
 * Fields that can appear on either a module (shared across all adapters) or
 * an adapter (variation per peer combination). When both define the same
 * field, the adapter-level value is merged on top of the module-level one:
 * - `dependencies`/`devDependencies`/`scripts` — merged per-key (adapter wins).
 * - `env` — merged by `name` (adapter wins).
 *
 * Hoisting these to the module level avoids the adapter-combinatorics tax:
 * a multi-framework, multi-orm module only re-declares what genuinely varies.
 */
export type ModuleInstallFields = {
  /** npm dependencies (name → semver range). */
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  /** Environment variables to add to `.env.example`. */
  env?: EnvVar[];
  /** package.json `scripts` to merge into the host package. */
  scripts?: Record<string, string>;
};

export type ModuleAdapter = ModuleInstallFields & {
  /** Stable key — composite of peer choices that selected this adapter. */
  key: string;
  /** Which peer module(s) this adapter handles. Empty record means "default / no peer". */
  match: Partial<Record<SlotId, ModuleId>>;
  /** Templates copied verbatim into the project (relative dest path → registry-relative source). */
  templates?: TemplateRef[];
  /**
   * Generic codemod invocations to run, in order. Each entry names a codemod
   * from the CLI's catalog (e.g. `wrap-root-layout`) plus the per-invocation
   * arguments. The CLI ships the implementations; the registry JSON carries
   * only data (id + args).
   */
  codemods?: CodemodInvocation[];
};

export type TemplateRef = {
  /** Path inside the module's templates/ folder. */
  src: string;
  /** Path in the generated project (relative to repo root or app root). */
  dest: string;
  /**
   * Where the dest is resolved against:
   *  - "repo": repo root
   *  - "app": the active framework app dir (apps/web by default)
   *  - "package": the slot's internal package dir under packages/<dir>, where
   *    `<dir>` is `SLOT_PACKAGE_DIR[module.slot]`. Invalid for slots whose
   *    entry is `null` (framework, styling).
   */
  scope?: "repo" | "app" | "package";
  /** If true, run as a template (mustache-style) with the manifest as context. */
  template?: boolean;
  /**
   * Embedded template contents. Populated by the registry build step so HTTP-
   * loaded modules carry their template payloads in the manifest. Local dev
   * (FS-based registry) leaves this undefined; the runner reads from disk.
   */
  content?: string;
};

/**
 * JSON-safe values for codemod arguments. The shape mirrors what survives a
 * round-trip through the registry JSON — strings, numbers, booleans, nulls,
 * and nested JSON values. Each catalog codemod narrows this to its own
 * concrete `TArgs` interface at the call site.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type CodemodInvocation = {
  /** Codemod id from the CLI's catalog (e.g. `"wrap-root-layout"`). */
  id: string;
  /** Per-invocation arguments. Shape is defined by the codemod's args contract. */
  args?: Record<string, JsonValue>;
};

export type EnvVar = {
  name: string;
  /** Example value placed in `.env.example`. */
  example: string;
  /** Required for the module to work, vs. nice-to-have. */
  required: boolean;
  description?: string;
};

/**
 * Inlined SVG markup for a module's logo. A bare string is theme-agnostic;
 * `{ light, dark }` lets the UI swap based on the active theme. The registry
 * build step auto-detects `logo.svg` (single) or `logo-light.svg` +
 * `logo-dark.svg` (pair) in the module directory and populates this field —
 * module authors don't write it manually.
 */
export type Logo = string | { light: string; dark: string };

export type Module = ModuleInstallFields & {
  id: ModuleId;
  slot: SlotId;
  /** Display name in the wizard / web builder. */
  label: string;
  description: string;
  /** Module schema version — pinned in stanza.json. */
  version: string;
  /** Peer module slots this module needs filled, with optional allow-list. */
  peers?: PeerRequirement;
  /**
   * Internal-package directories (by name, matching `SLOT_PACKAGE_DIR` values
   * — e.g. `"db"`) that this module's source code imports from. The runner
   * adds a `@<manifest.name>/<dir>: workspace:*` dep to this module's own
   * package so cross-package imports resolve. Module-level because the source
   * code in the slot's package is shared infrastructure across adapters;
   * adapters differ in templates and codemods, not in what they import.
   *
   * Only meaningful for modules whose slot maps to a package dir (auth, db,
   * orm). Ignored for app-scoped slots (framework, styling).
   */
  consumesPackages?: string[];
  /**
   * Concrete install recipes keyed by adapter. The resolver picks one based on
   * the project's other modules.
   */
  adapters: ModuleAdapter[];
  /** Optional homepage / docs URL surfaced in `stanza search`. */
  homepage?: string;
  /** Optional maintainer attribution. */
  author?: string;
  /** Inlined SVG logo, populated by the registry build step. */
  logo?: Logo;
};

/**
 * Lightweight summary suitable for the registry index — strips the codemod
 * implementations but keeps everything needed for the wizard / search UI.
 */
export type ModuleSummary = Omit<Module, "adapters"> & {
  adapters: Pick<ModuleAdapter, "key" | "match">[];
};

export type RegistryIndex = {
  generatedAt: string;
  schemaVersion: 1;
  slots: Slot[];
  modules: ModuleSummary[];
};

/**
 * Identity helper for module manifests — gives full inference and IDE
 * autocomplete without forcing a class hierarchy. The runtime cost is zero.
 */
export function defineModule(module: Module): Module {
  return module;
}

// Runtime-validatable schema for third-party / fetched manifests.
//
// Zod 4 requires `z.record(K, V)` — the 1-arg form is gone. We use
// `z.string()` for keys everywhere except `peers`, which keys on SlotId.

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const envVarSchema = z.object({
  name: z.string(),
  example: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
});

const installFieldsSchema = {
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  env: z.array(envVarSchema).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
};

export const ModuleSchema = z.object({
  id: z.string(),
  slot: z.enum(KNOWN_SLOTS),
  label: z.string(),
  description: z.string(),
  version: z.string(),
  // Zod 4: partialRecord because not every slot is constrained by a module.
  peers: z
    .partialRecord(z.enum(KNOWN_SLOTS), z.union([z.literal("any"), z.array(z.string())]))
    .optional(),
  consumesPackages: z.array(z.string()).optional(),
  ...installFieldsSchema,
  adapters: z.array(
    z.object({
      key: z.string(),
      match: z.record(z.string(), z.string()),
      templates: z
        .array(
          z.object({
            src: z.string(),
            dest: z.string(),
            scope: z.enum(["repo", "app", "package"]).optional(),
            template: z.boolean().optional(),
            content: z.string().optional(),
          }),
        )
        .optional(),
      codemods: z
        .array(
          z.object({
            id: z.string(),
            args: z.record(z.string(), jsonValueSchema).optional(),
          }),
        )
        .optional(),
      ...installFieldsSchema,
    }),
  ),
  homepage: z.string().optional(),
  author: z.string().optional(),
  logo: z.union([z.string(), z.object({ light: z.string(), dark: z.string() })]).optional(),
}) satisfies z.ZodType<Module>;
