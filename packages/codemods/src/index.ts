export type { CodemodContext, Codemod, CodemodResult } from "./types";

// Re-export common ts-morph types + the SyntaxKind enum so CLI codemods
// don't need a direct ts-morph dep.
export type {
  ExportAssignment,
  ExportDeclaration,
  ExportSpecifier,
  ImportDeclaration,
  JsxAttribute,
  JsxElement,
  JsxOpeningElement,
  Node,
  Project,
  SourceFile,
} from "ts-morph";
export { SyntaxKind } from "ts-morph";

export { openProject } from "./project";

export { addNamedImport, addDefaultImport, removeImport } from "./imports";
export type { NamedImportSpec } from "./imports";

export { addArrayElement, removeArrayElement } from "./arrays";

export {
  readJson,
  writeJson,
  mergeJson,
  setJsonPath,
  unsetJsonPath,
  setJsonPathSegments,
  unsetJsonPathSegments,
  addPackageDependency,
  removePackageDependency,
  addPackageScript,
} from "./json";

export { addEnvVar, removeEnvVar } from "./env";
