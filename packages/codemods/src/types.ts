import type { ModuleId, SlotId, StanzaManifest } from "@stanza/registry";
import type { Project } from "ts-morph";

export type CodemodContext = {
  /** Absolute path to the project root (where stanza.json lives). */
  projectRoot: string;
  /** Absolute path to the active app dir (manifest.appDir resolved). */
  appRoot: string;
  /** ts-morph Project, lazily opened on first AST-touching codemod. */
  project: () => Project;
  /** Current manifest snapshot (read-only inside a codemod). */
  manifest: StanzaManifest;
  /** The slot/module this codemod is acting on behalf of. */
  owner: { slot: SlotId; module: ModuleId };
  /** Adapter key the resolver selected — useful for adapter-specific branches. */
  adapter: string;
  /** Claim a region in stanza.json. Throws if a different owner already holds it. */
  claimRegion(filePath: string, region: string): void;
  /** Release a region (used by remove/inverse codemods). */
  releaseRegion(filePath: string, region: string): void;
};

export type CodemodResult = {
  /** Files this codemod touched (relative to projectRoot). For dry-run output. */
  touchedFiles: string[];
};

/**
 * A generic, reusable code transform. Each codemod implements one concept
 * (e.g. "wrap root layout with a provider") and is parameterized by `TArgs`
 * supplied per-invocation from the module manifest. The CLI ships a catalog
 * of these; modules pick from it via `adapter.codemods: [{ id, args }]`.
 *
 * Codemods never bake module-specific identifiers into their implementation —
 * if a module needs a bespoke transform, factor it into a new generic codemod
 * with the right argument surface.
 */
export type Codemod<TArgs = Record<string, unknown>> = {
  id: string;
  description?: string;
  apply(ctx: CodemodContext, args: TArgs): Promise<CodemodResult> | CodemodResult;
  /** Inverse for `stanza remove`. Ship these where cheap. */
  revert?(ctx: CodemodContext, args: TArgs): Promise<CodemodResult> | CodemodResult;
};
