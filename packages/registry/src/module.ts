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

/**
 * Ordered tuple of add-on category ids. Deliberately DISJOINT from
 * `KNOWN_SLOTS`: keeping these out of the slot tuple is what makes add-ons
 * invisible to peer resolution — `activePeerIds` and the peer-check loop in
 * `resolveAdapter` both iterate `KNOWN_SLOTS` only, so an add-on never blocks
 * anyone and never becomes a peer candidate. Add-ons are processed *after*
 * all slots (see `addonOrder`), so a framework/orm/db pick is already in the
 * manifest when an add-on resolves its framework-varying adapter.
 *
 * Unlike slots, an add-on category holds 0..n modules (vitest + playwright
 * coexist).
 */
export const KNOWN_ADDONS = ["testing", "tooling", "deploy", "email", "monorepo"] as const;

export type AddonCategoryId = (typeof KNOWN_ADDONS)[number];

export type AddonCategory = {
  id: AddonCategoryId;
  label: string;
  description: string;
  /**
   * Same semantics as `Slot.packageDir`. Add-ons are overwhelmingly app- or
   * repo-scoped (test/lint configs, deploy manifests), so this is `null` for
   * every first-party add-on today. Kept for symmetry and future extraction.
   */
  packageDir: string | null;
};

/** Single source of truth for add-on category metadata — parallel to `SLOTS`. */
export const ADDON_CATEGORIES: readonly AddonCategory[] = [
  { id: "testing", label: "Testing", description: "Test runners (unit, e2e).", packageDir: null },
  { id: "tooling", label: "Tooling", description: "Lint / format toolchain.", packageDir: null },
  { id: "deploy", label: "Deploy", description: "Deploy targets.", packageDir: null },
  { id: "email", label: "Email", description: "Transactional email.", packageDir: null },
  {
    id: "monorepo",
    label: "Monorepo",
    description: "Monorepo build tooling.",
    packageDir: null,
  },
];

export const ADDON_PACKAGE_DIR: Record<AddonCategoryId, string | null> = Object.fromEntries(
  ADDON_CATEGORIES.map((c) => [c.id, c.packageDir]),
) as Record<AddonCategoryId, string | null>;

const ADDON_BY_ID: Record<AddonCategoryId, AddonCategory> = Object.fromEntries(
  ADDON_CATEGORIES.map((c) => [c.id, c]),
) as Record<AddonCategoryId, AddonCategory>;

/** Display name for an add-on category — used by the wizard and CLI list output. */
export function addonLabel(category: AddonCategoryId): string {
  return ADDON_BY_ID[category].label;
}

/** Display name for a slot OR add-on category — used by surfaces that mix both. */
export function groupLabel(group: SlotId | AddonCategoryId): string {
  return (KNOWN_ADDONS as readonly string[]).includes(group)
    ? addonLabel(group as AddonCategoryId)
    : slotLabel(group as SlotId);
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

/** Fields shared by both slot and add-on modules. */
type ModuleCommon = ModuleInstallFields & {
  id: ModuleId;
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

/** A single-choice, constraint-bearing module that fills exactly one slot. */
export type SlotModule = ModuleCommon & {
  /** Discriminator. Optional so existing modules (no `kind`) parse as slots. */
  kind?: "slot";
  slot: SlotId;
};

/**
 * A multi-choice add-on. Several add-ons coexist in one category and none
 * constrains another module's adapter dispatch. An add-on CAN still declare
 * `peers` (e.g. `{ framework: ["next"] }`) and framework-varying adapters —
 * that's a one-way constraint (framework → add-on); the add-on never appears
 * in anyone else's `peers`/`match`.
 */
export type AddonModule = ModuleCommon & {
  kind: "addon";
  category: AddonCategoryId;
};

export type Module = SlotModule | AddonModule;

/** Narrowing guard — the runner, loader, and builder branch on this. */
export function isAddon(module: Module): module is AddonModule {
  return module.kind === "addon";
}

/**
 * The grouping key for a module: its slot id (slot modules) or category id
 * (add-ons). Used wherever code keys modules by their bucket — the registry
 * filename (`<group>-<id>`), the web builder's `${group}:${id}` map, CLI list
 * rows, etc. Works on both full `Module`s and the trimmed `ModuleSummary`.
 */
export function moduleGroup(m: Module | ModuleSummary): SlotId | AddonCategoryId {
  return "category" in m ? m.category : m.slot;
}

/**
 * Lightweight summary suitable for the registry index — strips the codemod
 * implementations but keeps everything needed for the wizard / search UI.
 */
export type ModuleSummary = (Omit<SlotModule, "adapters"> | Omit<AddonModule, "adapters">) & {
  adapters: Pick<ModuleAdapter, "key" | "match">[];
};

export type RegistryIndex = {
  generatedAt: string;
  schemaVersion: 1;
  slots: Slot[];
  addons: AddonCategory[];
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

const adapterSchema = z.object({
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
});

// Fields shared by both module variants. Spread into each branch of the
// discriminated union below.
const sharedModuleFields = {
  id: z.string(),
  label: z.string(),
  description: z.string(),
  version: z.string(),
  // Zod 4: partialRecord because not every slot is constrained by a module.
  peers: z
    .partialRecord(z.enum(KNOWN_SLOTS), z.union([z.literal("any"), z.array(z.string())]))
    .optional(),
  consumesPackages: z.array(z.string()).optional(),
  ...installFieldsSchema,
  adapters: z.array(adapterSchema),
  homepage: z.string().optional(),
  author: z.string().optional(),
  logo: z.union([z.string(), z.object({ light: z.string(), dark: z.string() })]).optional(),
};

const slotModuleSchema = z.object({
  kind: z.literal("slot"),
  slot: z.enum(KNOWN_SLOTS),
  ...sharedModuleFields,
});

const addonModuleSchema = z.object({
  kind: z.literal("addon"),
  category: z.enum(KNOWN_ADDONS),
  ...sharedModuleFields,
});

// Existing module manifests omit `kind` — default it to "slot" before
// discriminating so first-party (and pre-add-on third-party) JSON validates.
export const ModuleSchema = z.preprocess(
  (value) =>
    value && typeof value === "object" && !("kind" in value)
      ? { ...(value as object), kind: "slot" }
      : value,
  z.discriminatedUnion("kind", [slotModuleSchema, addonModuleSchema]),
) satisfies z.ZodType<Module>;
