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
import addArrayEntryInCall from "./add-array-entry-in-call";
import addJsxChild from "./add-jsx-child";
import addPackageDep from "./add-package-dep";
import addPluginToCall from "./add-plugin-to-call";
import appendToFile from "./append-to-file";
import reExport from "./re-export";
import replaceImport from "./replace-import";
import setHtmlAttributes from "./set-html-attributes";
import setTsconfigPaths from "./set-tsconfig-paths";
import wrapRootLayout from "./wrap-root-layout";

export const CODEMOD_CATALOG: Record<string, Codemod> = {
  [addArrayEntryInCall.id]: addArrayEntryInCall,
  [addJsxChild.id]: addJsxChild,
  [addPackageDep.id]: addPackageDep,
  [addPluginToCall.id]: addPluginToCall,
  [appendToFile.id]: appendToFile,
  [reExport.id]: reExport,
  [replaceImport.id]: replaceImport,
  [setHtmlAttributes.id]: setHtmlAttributes,
  [setTsconfigPaths.id]: setTsconfigPaths,
  [wrapRootLayout.id]: wrapRootLayout,
};

export {
  addArrayEntryInCall,
  addJsxChild,
  addPackageDep,
  addPluginToCall,
  appendToFile,
  reExport,
  replaceImport,
  setHtmlAttributes,
  setTsconfigPaths,
  wrapRootLayout,
};
export type { AddArrayEntryInCallArgs } from "./add-array-entry-in-call";
export type { AddJsxChildArgs } from "./add-jsx-child";
export type { AddPackageDepArgs } from "./add-package-dep";
export type { AddPluginToCallArgs } from "./add-plugin-to-call";
export type { AppendToFileArgs } from "./append-to-file";
export type { ReExportArgs } from "./re-export";
export type { ReplaceImportArgs } from "./replace-import";
export type { SetHtmlAttributesArgs } from "./set-html-attributes";
export type { SetTsconfigPathsArgs } from "./set-tsconfig-paths";
export type { WrapRootLayoutArgs } from "./wrap-root-layout";
