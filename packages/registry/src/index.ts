export type {
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

export type { StanzaManifest, StanzaModuleRecord, RegionMap, RegionOwnership } from "./manifest";
export {
  StanzaManifestSchema,
  CURRENT_MANIFEST_VERSION,
  MANIFEST_SCHEMA_URL,
  emptyManifest,
  selectedOne,
  selectedAll,
  manifestJsonSchema,
} from "./manifest";

export type { ResolveContext, ResolveResult, ResolveError } from "./resolver";
export { resolveAdapter, isCompatible, categoryOrder } from "./resolver";

export type {
  PackageManager,
  PackageJson,
  MergedInstallFields,
  ResolvedEntry,
  Resolved,
} from "./package-json";
export {
  mergeInstallFields,
  installPackageJson,
  rootPackageJson,
  appPackageJsonBase,
  slotPackageJsonBase,
  synthesizePackageJsons,
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
