export type { CodemodContext, Codemod, CodemodResult } from "./types.ts";

// Re-export the ts-morph Project type so consumers don't need a direct
// ts-morph dep just to type a parameter.
export type { Project, SourceFile } from "ts-morph";

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
