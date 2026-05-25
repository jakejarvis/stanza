export type {
  AppKind,
  Category,
  CategoryId,
  Cardinality,
  InstallHome,
  ModuleId,
  PeerRequirement,
  Module,
  ModuleAdapter,
  ModuleSummary,
  RegistryIndex,
  TemplateRef,
  EnvVar,
  Logo,
  CodemodInvocation,
  JsonValue,
} from "./module";
export {
  APP_KINDS,
  defineModule,
  CATEGORIES,
  KNOWN_CATEGORIES,
  isCategoryId,
  PEER_CATEGORIES,
  PACKAGE_DIRS,
  categoryLabel,
  categoryHome,
  categoryCardinality,
  isMulti,
  ModuleSchema,
  ModuleSummarySchema,
  RegistryIndexSchema,
} from "./module";

export type {
  AppSpec,
  StanzaManifest,
  StanzaModuleRecord,
  RegionMap,
  RegionOwnership,
} from "./manifest";
export {
  StanzaManifestSchema,
  CURRENT_MANIFEST_VERSION,
  MANIFEST_SCHEMA_URL,
  defaultWebApp,
  emptyManifest,
  getApp,
  appsForRecord,
  selectedOne,
  selectedAll,
  manifestJsonSchema,
} from "./manifest";

export type { ResolveContext, ResolveResult, ResolveError } from "./resolver";
export { resolveAdapter, isCompatible, categoryOrder, activePeerIds } from "./resolver";

export type {
  PackageManager,
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
  appendEnvVar,
  synthesizeEnvExample,
  synthesizeManifest,
  synthesizeTemplates,
} from "./synthesize";

export type { TemplateContext } from "./template";
export { renderTemplate, buildRenderContext } from "./template";

export type { ProjectNameValidation } from "./project-name";
export { validateProjectName } from "./project-name";
