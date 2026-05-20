import { z } from "zod";

export const KNOWN_SLOTS = ["framework", "orm", "db", "auth", "styling"] as const;

export type SlotId = (typeof KNOWN_SLOTS)[number];

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
   * Codemod IDs to run, in order. The CLI looks these up in the module's
   * codemod registry (loaded lazily so the registry index stays JSON-serializable).
   */
  codemods?: string[];
  /** npm dependencies this adapter adds (name → semver range). */
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  /** Environment variables to add to `.env.example`. */
  env?: EnvVar[];
  /** package.json `scripts` to merge into the host app. */
  scripts?: Record<string, string>;
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
   */
  scope?: "repo" | "app";
  /** If true, run as a template (mustache-style) with the manifest as context. */
  template?: boolean;
  /**
   * Embedded template contents. Populated by the registry build step so HTTP-
   * loaded modules carry their template payloads in the manifest. Local dev
   * (FS-based registry) leaves this undefined; the runner reads from disk.
   */
  content?: string;
};

export type EnvVar = {
  name: string;
  /** Example value placed in `.env.example`. */
  example: string;
  /** Required for the module to work, vs. nice-to-have. */
  required: boolean;
  description?: string;
};

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
            scope: z.enum(["repo", "app"]).optional(),
            template: z.boolean().optional(),
            content: z.string().optional(),
          }),
        )
        .optional(),
      codemods: z.array(z.string()).optional(),
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
    }),
  ),
  homepage: z.string().optional(),
  author: z.string().optional(),
}) satisfies z.ZodType<Module>;
