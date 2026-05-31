export type { ResolveContext, ResolveResult, ResolveError } from "./resolver";
export { resolveAdapter, isCompatible, categoryOrder, activePeerIds } from "./resolver";

export type {
  PackageJson,
  MergedInstallFields,
  ResolvedEntry,
  Resolved,
  SynthesizeEntry,
} from "./package-json";
export {
  mergeInstallFields,
  installPackageJsonTargets,
  rootPackageJson,
  appPackageJsonBase,
  slotPackageJsonBase,
  synthesizePackageJsons,
  PM_FLOOR_VERSION,
} from "./package-json";

export {
  ENV_EXAMPLE_HEADER,
  synthesizeEnvExample,
  synthesizeManifest,
  synthesizeReadme,
  synthesizeTemplates,
} from "./synthesize";

export type { TemplateContext } from "./template";
export { renderTemplate, buildRenderContext, pmRun, pmRecursive } from "./template";

export type { ProjectNameValidation } from "./project-name";
export { validateProjectName } from "./project-name";
