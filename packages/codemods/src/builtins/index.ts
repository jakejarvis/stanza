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
import addPackageDep from "./add-package-dep";
import addPluginToCall from "./add-plugin-to-call";
import appendToFile from "./append-to-file";
import reExport from "./re-export";
import wrapRootLayout from "./wrap-root-layout";

export const CODEMOD_CATALOG: Record<string, Codemod> = {
  [addPackageDep.id]: addPackageDep,
  [addPluginToCall.id]: addPluginToCall,
  [appendToFile.id]: appendToFile,
  [reExport.id]: reExport,
  [wrapRootLayout.id]: wrapRootLayout,
};

export { addPackageDep, addPluginToCall, appendToFile, reExport, wrapRootLayout };
export type { AddPackageDepArgs } from "./add-package-dep";
export type { AddPluginToCallArgs } from "./add-plugin-to-call";
export type { AppendToFileArgs } from "./append-to-file";
export type { ReExportArgs } from "./re-export";
export type { WrapRootLayoutArgs } from "./wrap-root-layout";
