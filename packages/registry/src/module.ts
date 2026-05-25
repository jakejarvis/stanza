import { z } from "zod";

/**
 * Kind of app a framework module targets. The closed enum lets the runtime
 * validate "you can't install Next.js into a `kind: \"native\"` app" — add new
 * kinds here as they're introduced (and the schema picks them up).
 */
export const APP_KINDS = ["web", "native"] as const;
export type AppKind = (typeof APP_KINDS)[number];

/** Where a category's install fields and `scope`-derived templates land. */
export type InstallHome =
  | { kind: "app" } // an app entry in manifest.apps[] (selected per install)
  | { kind: "repo" } // monorepo root
  | { kind: "package"; dir: string }; // packages/<dir>/, named @<name>/<dir>

/** How many modules a category holds: a single choice, or several coexisting. */
export type Cardinality = "one" | "many";

export type Category = {
  id: CategoryId;
  label: string;
  description: string;
  /** `"one"` → single-choice (framework, auth); `"many"` → coexist (testing). */
  cardinality: Cardinality;
  /** Install destination for this category's modules. */
  home: InstallHome;
};

/**
 * Single source of truth for categories — `CategoryId` and `KNOWN_CATEGORIES`
 * derive from this, so adding one is a one-place edit. Order is topological:
 * a category appears after every category it can peer on, and `many` (leaf)
 * categories come last. It's also the wizard prompt + processing order.
 *
 * Constraint-bearing is emergent: a category is a peer candidate iff some
 * module declares `peers`/`match` against it. The resolver only treats
 * `cardinality: "one"` categories as peers (`PEER_CATEGORIES`).
 */
export const CATEGORIES = [
  {
    id: "framework",
    label: "Framework",
    description: "Web/native app framework.",
    cardinality: "one",
    home: { kind: "app" },
  },
  {
    id: "ui",
    label: "UI",
    description: "Styling system + component primitives.",
    cardinality: "one",
    home: { kind: "package", dir: "ui" },
  },
  {
    id: "db",
    label: "Database",
    description: "Database engine.",
    cardinality: "one",
    home: { kind: "package", dir: "db" },
  },
  {
    id: "orm",
    label: "ORM",
    description: "Database query layer.",
    cardinality: "one",
    home: { kind: "package", dir: "db" },
  },
  {
    id: "auth",
    label: "Auth",
    description: "Authentication provider.",
    cardinality: "one",
    home: { kind: "package", dir: "auth" },
  },
  {
    id: "payments",
    label: "Payments",
    description: "Checkout + webhooks.",
    cardinality: "one",
    home: { kind: "package", dir: "payments" },
  },
  {
    id: "email",
    label: "Email",
    description: "Transactional email.",
    cardinality: "one",
    home: { kind: "package", dir: "email" },
  },
  {
    id: "tooling",
    label: "Tooling",
    description: "Linter + formatter toolchain.",
    cardinality: "one",
    home: { kind: "repo" },
  },
  {
    id: "testing",
    label: "Testing",
    description: "Test runners (unit, e2e).",
    cardinality: "many",
    home: { kind: "app" },
  },
  {
    id: "deploy",
    label: "Deploy",
    description: "Deploy targets.",
    cardinality: "many",
    home: { kind: "repo" },
  },
  {
    id: "monorepo",
    label: "Monorepo",
    description: "Monorepo build tooling.",
    cardinality: "many",
    home: { kind: "repo" },
  },
  // Inline shape (not `Category`) so `CategoryId` derives without a cycle.
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  cardinality: Cardinality;
  home: InstallHome;
}[];

/** Legal category ids, derived from `CATEGORIES`. */
export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** Category ids as a non-empty tuple — the shape `z.enum` needs. Also the processing order. */
const [firstCategory, ...restCategories] = CATEGORIES;
export const KNOWN_CATEGORIES: [CategoryId, ...CategoryId[]] = [
  firstCategory.id,
  ...restCategories.map((c) => c.id),
];

/** Runtime guard narrowing an arbitrary string to a known `CategoryId`. */
export function isCategoryId(value: string): value is CategoryId {
  return KNOWN_CATEGORIES.some((id) => id === value);
}

// `Object.fromEntries` widens keys to `string`; CATEGORIES covers every
// CategoryId by construction, so narrowing to the exhaustive record is sound.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  CategoryId,
  Category
>;

/** Display name — used by the wizard, summary, and CLI/web list output. */
export function categoryLabel(id: CategoryId): string {
  return CATEGORY_BY_ID[id].label;
}

/** Install destination for a category's modules. */
export function categoryHome(id: CategoryId): InstallHome {
  return CATEGORY_BY_ID[id].home;
}

export function categoryCardinality(id: CategoryId): Cardinality {
  return CATEGORY_BY_ID[id].cardinality;
}

/** True for multi-choice categories (testing, deploy, …). */
export function isMulti(id: CategoryId): boolean {
  return CATEGORY_BY_ID[id].cardinality === "many";
}

/**
 * Categories that can be peers — only `cardinality: "one"` ones, since you
 * dispatch on "the framework", not on a set. The resolver iterates these.
 */
export const PEER_CATEGORIES = CATEGORIES.filter((c) => c.cardinality === "one").map(
  (c) => c.id,
) as CategoryId[];

/** Unique package dirs across all categories (for cross-package wiring + sweep). */
export const PACKAGE_DIRS: Set<string> = new Set(
  CATEGORIES.flatMap((c) => (c.home.kind === "package" ? [c.home.dir] : [])),
);

export type ModuleId = string;

export type PeerRequirement = {
  [K in CategoryId]?: ModuleId[] | "any";
};

/**
 * Fields that can appear on either a module (shared across all adapters) or
 * an adapter (variation per peer combination). When both define the same
 * field, the adapter-level value is merged on top of the module-level one:
 * - `dependencies`/`devDependencies`/`scripts` — merged per-key (adapter wins).
 * - `env` — merged by `name` (adapter wins).
 */
export type ModuleInstallFields = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  env?: EnvVar[];
  scripts?: Record<string, string>;
};

export type ModuleAdapter = ModuleInstallFields & {
  /** Stable key — composite of peer choices that selected this adapter. */
  key: string;
  /** Which peer module(s) this adapter handles. Empty record means "default / no peer". */
  match: Partial<Record<CategoryId, ModuleId>>;
  /** Templates copied verbatim into the project. */
  templates?: TemplateRef[];
  /**
   * Generic codemod invocations to run, in order. Each entry names a codemod
   * from the CLI's catalog plus the per-invocation arguments — the registry
   * JSON carries only data (id + args), never code.
   */
  codemods?: CodemodInvocation[];
};

export type TemplateRef = {
  /** Path inside the module's templates/ folder. */
  src: string;
  /** Path in the generated project, resolved against `scope`. */
  dest: string;
  /**
   * Where the dest is resolved:
   *  - "repo": repo root
   *  - "app": the active app dir (apps/web by default)
   *  - "package": the category's `home.dir` under packages/<dir> — only valid
   *    for categories whose `home.kind` is `"package"`.
   */
  scope?: "repo" | "app" | "package";
  /** If true, run as a template (mustache-style) with the manifest as context. */
  template?: boolean;
  /**
   * Embedded template contents. Populated by the registry build step so HTTP-
   * loaded modules carry their template payloads in the manifest. Local dev
   * leaves this undefined; the runner reads from disk.
   */
  content?: string;
};

/**
 * JSON-safe values for codemod arguments — what survives a round-trip through
 * the registry JSON. Each catalog codemod narrows this to its own `TArgs`.
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
  args?: Record<string, JsonValue>;
};

export type EnvVar = {
  name: string;
  example: string;
  required: boolean;
  description?: string;
};

/**
 * Inlined SVG markup for a module's logo. A bare string is theme-agnostic;
 * `{ light, dark }` lets the UI swap based on theme. The registry build step
 * auto-detects `logo.svg` (single) or `logo-light.svg`/`logo-dark.svg` (pair).
 */
export type Logo = string | { light: string; dark: string };

/**
 * A registry module. It fills exactly one `category`; the category's
 * `cardinality` decides whether it's single- or multi-choice, and its `home`
 * decides where the module's output lands.
 */
export type Module = ModuleInstallFields & {
  category: CategoryId;
  id: ModuleId;
  /** Display name in the wizard / web builder. */
  label: string;
  description: string;
  /** Module schema version — pinned in stanza.json. */
  version: string;
  /** Peer categories this module needs filled, with optional allow-list. */
  peers?: PeerRequirement;
  /**
   * Internal-package dirs (matching a category's `home.dir`, e.g. `"db"`) this
   * module's source imports from. The runner adds a `@<name>/<dir>: workspace:*`
   * dep to this module's own package so cross-package imports resolve.
   */
  consumesPackages?: string[];
  /** Concrete install recipes keyed by adapter; the resolver picks one. */
  adapters: ModuleAdapter[];
  /**
   * Kind of app this module targets. Required (by convention) for `framework`
   * modules so the runner can validate that an app's `kind` matches the
   * framework being installed into it. Other categories can declare it later
   * when peer-matching on `framework` isn't expressive enough.
   */
  appKind?: AppKind;
  homepage?: string;
  author?: string;
  /** Inlined SVG logo, populated by the registry build step. */
  logo?: Logo;
};

/**
 * Lightweight summary for the registry index — strips codemod implementations
 * but keeps everything the wizard / search UI needs.
 */
export type ModuleSummary = Omit<Module, "adapters"> & {
  adapters: Pick<ModuleAdapter, "key" | "match">[];
};

export type RegistryIndex = {
  generatedAt: string;
  schemaVersion: 1;
  categories: Category[];
  modules: ModuleSummary[];
};

/**
 * Identity helper for module manifests — full inference + IDE autocomplete with
 * zero runtime cost.
 */
export function defineModule(module: Module): Module {
  return module;
}

// Runtime-validatable schema for third-party / fetched manifests.

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

/** Shape shared by a full `Module` and its index `ModuleSummary` (all but `adapters`). */
const moduleBaseShape = {
  category: z.enum(KNOWN_CATEGORIES),
  id: z.string(),
  label: z.string(),
  description: z.string(),
  version: z.string(),
  // Zod 4: partialRecord because not every category is constrained by a module.
  peers: z
    .partialRecord(z.enum(KNOWN_CATEGORIES), z.union([z.literal("any"), z.array(z.string())]))
    .optional(),
  consumesPackages: z.array(z.string()).optional(),
  ...installFieldsSchema,
  appKind: z.enum(APP_KINDS).optional(),
  homepage: z.string().optional(),
  author: z.string().optional(),
  logo: z.union([z.string(), z.object({ light: z.string(), dark: z.string() })]).optional(),
};

export const ModuleSchema = z.object({
  ...moduleBaseShape,
  adapters: z.array(adapterSchema),
}) satisfies z.ZodType<Module>;

/** Category metadata as served in the registry `index.json`. */
const categorySchema = z.object({
  id: z.enum(KNOWN_CATEGORIES),
  label: z.string(),
  description: z.string(),
  cardinality: z.enum(["one", "many"]),
  home: z.union([
    z.object({ kind: z.literal("app") }),
    z.object({ kind: z.literal("repo") }),
    z.object({ kind: z.literal("package"), dir: z.string() }),
  ]),
}) satisfies z.ZodType<Category>;

/** Index summary: full module metadata with adapters reduced to `key` + `match`. */
export const ModuleSummarySchema = z.object({
  ...moduleBaseShape,
  adapters: z.array(z.object({ key: z.string(), match: z.record(z.string(), z.string()) })),
}) satisfies z.ZodType<ModuleSummary>;

/** Runtime-validatable schema for the registry `index.json` payload. */
export const RegistryIndexSchema = z.object({
  generatedAt: z.string(),
  schemaVersion: z.literal(1),
  categories: z.array(categorySchema),
  modules: z.array(ModuleSummarySchema),
}) satisfies z.ZodType<RegistryIndex>;
