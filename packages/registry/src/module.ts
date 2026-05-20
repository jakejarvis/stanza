import { z } from "zod";

export const KNOWN_SLOTS = ["framework", "orm", "db", "auth", "styling"] as const;

export type SlotId = (typeof KNOWN_SLOTS)[number];

/**
 * Slot → internal-package directory under `packages/`. Modules whose slot has
 * a non-null entry are extracted into their own workspace package
 * (`packages/<dir>/`, named `@<manifest.name>/<dir>`); the app consumes them
 * via a `workspace:*` dep. Many-to-one is intentional: `db` and `orm` share a
 * single `packages/db/` package so the ORM client can sit next to the schema
 * it queries.
 *
 * `null` means "no package — `scope: "package"` is invalid for this slot".
 * Framework and styling stay app-scoped because they wire the app shell
 * itself (root layout, global CSS) and have no meaningful separation point.
 */
export const SLOT_PACKAGE_DIR: Record<SlotId, string | null> = {
  framework: null,
  styling: null,
  auth: "auth",
  db: "db",
  orm: "db",
};

export type Slot = {
  id: SlotId;
  label: string;
  description: string;
};

export type ModuleId = string;

export type Capability = "web" | "native" | "react" | "node" | "edge" | "ssr" | "rsc";

export type PeerRequirement = {
  [K in SlotId]?: ModuleId[] | "any";
};

export type ModuleAdapter = {
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
  /** npm dependencies this adapter adds (name → semver range). */
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  /** Environment variables to add to `.env.example`. */
  env?: EnvVar[];
  /** package.json `scripts` to merge into the host app. */
  scripts?: Record<string, string>;
  /**
   * Other internal-package directories this adapter consumes — referenced by
   * the same name used in `SLOT_PACKAGE_DIR` values (e.g. `"db"`). The runner
   * adds `@<manifest.name>/<dir>: workspace:*` to this adapter's package so
   * cross-package imports resolve. Only meaningful when this adapter's own
   * slot maps to a package dir.
   */
  peerPackages?: string[];
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

export type Module = {
  id: ModuleId;
  slot: SlotId;
  /** Display name in the wizard / web builder. */
  label: string;
  description: string;
  /** Module schema version — pinned in stanza.json. */
  version: string;
  /** Tags this module provides to peers downstream. */
  provides?: Capability[];
  /** Capabilities this module needs from the project. */
  requires?: Capability[];
  /** Peer module slots this module needs filled, with optional allow-list. */
  peers?: PeerRequirement;
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

export const ModuleSchema = z.object({
  id: z.string(),
  slot: z.enum(KNOWN_SLOTS),
  label: z.string(),
  description: z.string(),
  version: z.string(),
  provides: z.array(z.enum(["web", "native", "react", "node", "edge", "ssr", "rsc"])).optional(),
  requires: z.array(z.enum(["web", "native", "react", "node", "edge", "ssr", "rsc"])).optional(),
  // Zod 4: partialRecord because not every slot is constrained by a module.
  peers: z
    .partialRecord(z.enum(KNOWN_SLOTS), z.union([z.literal("any"), z.array(z.string())]))
    .optional(),
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
      dependencies: z.record(z.string(), z.string()).optional(),
      devDependencies: z.record(z.string(), z.string()).optional(),
      env: z
        .array(
          z.object({
            name: z.string(),
            example: z.string(),
            required: z.boolean(),
            description: z.string().optional(),
          }),
        )
        .optional(),
      scripts: z.record(z.string(), z.string()).optional(),
      peerPackages: z.array(z.string()).optional(),
    }),
  ),
  homepage: z.string().optional(),
  author: z.string().optional(),
  logo: z.union([z.string(), z.object({ light: z.string(), dark: z.string() })]).optional(),
}) satisfies z.ZodType<Module>;
