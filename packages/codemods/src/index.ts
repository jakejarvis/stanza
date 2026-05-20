export type { CodemodContext, Codemod, CodemodResult } from "./types.ts";

// Re-export common ts-morph types + the SyntaxKind enum so module codemods
// don't need a direct ts-morph dep.
export type { Project, SourceFile, Node } from "ts-morph";
export { SyntaxKind } from "ts-morph";

export { openProject } from "./project.ts";

export { addNamedImport, addDefaultImport, removeImport } from "./imports.ts";

export { addArrayElement, removeArrayElement } from "./arrays.ts";

export {
  readJson,
  writeJson,
  mergeJson,
  setJsonPath,
  unsetJsonPath,
  addPackageDependency,
  removePackageDependency,
  addPackageScript,
} from "./json.ts";

export { addEnvVar, removeEnvVar } from "./env.ts";

export { renderTemplate, writeTemplateFile } from "./template.ts";
