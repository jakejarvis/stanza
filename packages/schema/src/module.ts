import { safeRelativePath } from "@withstanza/utils";
import { z } from "zod";

import {
  APP_KINDS,
  type AppKind,
  type Category,
  type CategoryId,
  categoryHome,
  KNOWN_CATEGORIES,
  type ModuleId,
} from "./category";

export type PeerRequirement = {
  [K in CategoryId]?: ModuleId[] | "any";
};

/**
 * Fields that route to a single target, used inside `app` overlays where the
 * recursive `app: { app: {...} }` would be meaningless.
 */
export type AppInstallFields = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  env?: EnvVar[];
  scripts?: Record<string, string>;
};

/**
 * Fields that can appear on either a module (shared across all adapters) or
 * an adapter (variation per peer combination). When both define the same
 * field, the adapter-level value is merged on top of the module-level one:
 * - `dependencies`/`devDependencies`/`scripts` — merged per-key (adapter wins).
 * - `env` — merged by `name` (adapter wins).
 *
 * The `app` overlay routes its fields to the *consuming app(s)* regardless of
 * the module's category home. Used by `home: "package"` modules whose
 * app-scoped shims import npm packages directly — the shim's dep belongs with
 * the app, not the shared package (e.g. `next-themes` for a shadcn shim that
 * lives in `apps/<id>/components/theme-provider.tsx`). Forbidden on
 * `home: "repo"` modules; redundant on `home: "app"` modules (their primary
 * fields already land in the apps).
 */
export type ModuleInstallFields = AppInstallFields & {
  app?: AppInstallFields;
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
  /**
   * Markdown contributed to the project README, rendered with the same
   * Handlebars context as templates (`{{ project.name }}`, `{{ peers.* }}`,
   * `{{ packages.<dir>.name }}`). Populated by the registry build from a
   * sidecar `readme.md` next to `module.ts` — module authors don't set it
   * directly. Used by `synthesizeReadme` to compose a per-project README.
   */
  readme?: string;
};

/**
 * Lightweight per-module metadata for the registry index — strips template
 * bodies and codemod implementations but keeps everything the wizard, search,
 * and web builder need for display + peer resolution.
 */
export type ModuleMetadata = Omit<Module, "adapters"> & {
  adapters: Pick<ModuleAdapter, "key" | "match">[];
};

/**
 * A module entry in the registry's main file. Extends the display metadata with
 * `path` — a relative URI to the module's full JSON, resolved against the main
 * file's own location. The loader reads `path` verbatim; there is no
 * filename/directory convention.
 */
export type RegistryEntry = ModuleMetadata & {
  /** Relative path/URI to this module's full JSON, resolved against the main file. */
  path: string;
};

export type RegistryIndex = {
  generatedAt: string;
  schemaVersion: 2;
  categories: Category[];
  modules: RegistryEntry[];
};

/**
 * Identity helper for module manifests — full inference + IDE autocomplete.
 * Also throws early on the one structural rule that's hard to express in
 * the type system: an `app` install-fields overlay is meaningless for
 * `home: "repo"` modules (there's no app target to route to).
 */
export function defineModule(module: Module): Module {
  if (categoryHome(module.category).kind === "repo") {
    const hasApp = hasAppOverlay(module) || module.adapters.some((a) => hasAppOverlay(a));
    if (hasApp) {
      throw new Error(
        `defineModule(${module.category}/${module.id}): \`app\` install fields are ` +
          `forbidden for \`home: "repo"\` modules. Move the deps to top-level ` +
          `\`dependencies\` (they'll route to the repo root) or split out an app-home module.`,
      );
    }
  }
  return module;
}

function hasAppOverlay(x: ModuleInstallFields): boolean {
  if (!x.app) return false;
  return Boolean(
    (x.app.dependencies && Object.keys(x.app.dependencies).length > 0) ||
    (x.app.devDependencies && Object.keys(x.app.devDependencies).length > 0) ||
    (x.app.scripts && Object.keys(x.app.scripts).length > 0) ||
    (x.app.env && x.app.env.length > 0),
  );
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

const appInstallFieldsSchema = {
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  env: z.array(envVarSchema).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
};

// Path traversal defense — template src/dest values come from third-party
// registry JSON, which can't be trusted to stay inside the project root.
const relativePathSchema = z.string().superRefine((s, ctx) => {
  const err = safeRelativePath(s);
  if (err) ctx.addIssue({ code: "custom", message: err });
});

const installFieldsSchema = {
  ...appInstallFieldsSchema,
  // The `app` overlay routes to consuming app(s) instead of the module's
  // home target. Non-recursive — `app.app` would be meaningless.
  app: z.object(appInstallFieldsSchema).optional(),
};

const adapterSchema = z.object({
  key: z.string(),
  // Keys must be valid category ids — typos would silently score specificity 0
  // (resolver iterates `KNOWN_CATEGORIES`) and lose to less-specific siblings.
  match: z.partialRecord(z.enum(KNOWN_CATEGORIES), z.string()),
  templates: z
    .array(
      z.object({
        src: relativePathSchema,
        dest: relativePathSchema,
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

/** Shape shared by a full `Module` and its index `ModuleMetadata` (all but `adapters`). */
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
  readme: z.string().optional(),
};

export const ModuleSchema = z
  .object({
    ...moduleBaseShape,
    adapters: z.array(adapterSchema),
  })
  .superRefine((mod, ctx) => {
    if (categoryHome(mod.category).kind !== "repo") return;
    const offenders: string[] = [];
    if (hasAppOverlay(mod)) offenders.push("module");
    for (const a of mod.adapters) {
      if (hasAppOverlay(a)) offenders.push(`adapter "${a.key}"`);
    }
    if (offenders.length > 0) {
      ctx.addIssue({
        code: "custom",
        message:
          `\`app\` install fields are forbidden for \`home: "repo"\` modules ` +
          `(category "${mod.category}"). Offenders: ${offenders.join(", ")}.`,
        path: ["app"],
      });
    }
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

/** Per-module index entry: full metadata with adapters reduced to `key` + `match`. */
export const ModuleMetadataSchema = z.object({
  ...moduleBaseShape,
  adapters: z.array(
    z.object({
      key: z.string(),
      match: z.partialRecord(z.enum(KNOWN_CATEGORIES), z.string()),
    }),
  ),
}) satisfies z.ZodType<ModuleMetadata>;

/**
 * A main-file module entry: index metadata plus the relative `path` to the
 * module's full JSON. `path` reuses the safe-relative-path guard so a hostile
 * main file can't escape its own directory (`../../etc`) or inject a scheme.
 */
export const RegistryEntrySchema = ModuleMetadataSchema.extend({
  path: relativePathSchema,
}) satisfies z.ZodType<RegistryEntry>;

/** Runtime-validatable schema for the registry main-file (index) payload. */
export const RegistryIndexSchema = z.object({
  generatedAt: z.string(),
  schemaVersion: z.literal(2),
  categories: z.array(categorySchema),
  modules: z.array(RegistryEntrySchema),
}) satisfies z.ZodType<RegistryIndex>;
