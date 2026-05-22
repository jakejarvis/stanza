/**
 * Catalog of generic codemods stanza ships with.
 *
 * Each entry is keyed by its public id — the same string modules reference
 * from their adapter's `codemods: [{ id, args }]`. Implementations are
 * parameterized by per-invocation `args`, so the same codemod is reused
 * across modules (e.g. `wrap-root-layout` serves both Clerk and any future
 * provider-style auth/state library).
 *
 * Adding a codemod? Drop a `<id>.ts` next to this file, default-export the
 * `Codemod`, and add a line to the map below. TS catches drift at compile
 * time.
 *
 * Bespoke per-module transforms don't belong here — if a module's need
 * doesn't fit an existing generic codemod, design a new generic codemod
 * with the right argument surface and add it to the catalog.
 *
 * The catalog lives in `@stanza/codemods/builtins` (this file) so it sits
 * next to the helper primitives it uses; consumers import via the package's
 * subpath export.
 */
import type { Codemod } from "../index";
import addVitePlugin from "./add-vite-plugin";
import appendToFile from "./append-to-file";
import reExport from "./re-export";
import wrapRootLayout from "./wrap-root-layout";

export const CODEMOD_CATALOG: Record<string, Codemod> = {
  [addVitePlugin.id]: addVitePlugin,
  [appendToFile.id]: appendToFile,
  [reExport.id]: reExport,
  [wrapRootLayout.id]: wrapRootLayout,
};

export { addVitePlugin, appendToFile, reExport, wrapRootLayout };
export type { AddVitePluginArgs } from "./add-vite-plugin";
export type { AppendToFileArgs } from "./append-to-file";
export type { ReExportArgs } from "./re-export";
export type { WrapRootLayoutArgs } from "./wrap-root-layout";
