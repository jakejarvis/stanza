export type { AppKind, Cardinality, Category, CategoryId, InstallHome, ModuleId } from "./category";
export {
  APP_KINDS,
  CATEGORIES,
  categoryCardinality,
  categoryDescription,
  categoryHome,
  categoryLabel,
  isCategoryId,
  isMulti,
  KNOWN_CATEGORIES,
  PACKAGE_DIRS,
  PEER_CATEGORIES,
} from "./category";

export type {
  AppSpec,
  RegionMap,
  RegionOwnership,
  StanzaManifest,
  StanzaModuleRecord,
} from "./manifest";
export {
  appsForRecord,
  compileManifestJsonSchema,
  CURRENT_MANIFEST_VERSION,
  declaredEnvNames,
  defaultWebApp,
  emptyManifest,
  getApp,
  MANIFEST_SCHEMA_URL,
  REGISTRY_BASE_URL,
  selectedAll,
  selectedOne,
  StanzaManifestSchema,
  SUPPORTED_MANIFEST_VERSIONS,
} from "./manifest";

export type { PackageManager } from "./package-manager";
export { DEFAULT_PACKAGE_MANAGER, isPackageManager, PackageManagerSchema } from "./package-manager";

export type { RegistryConfig } from "./registry-config";
export {
  DEFAULT_NAMESPACE,
  expandEnv,
  isLikelyNamespaceTypo,
  isNamespace,
  isValidModuleId,
  parseModuleSpec,
  RegistriesSchema,
  RegistryConfigSchema,
} from "./registry-config";

export type {
  CodemodInvocation,
  EnvVar,
  JsonValue,
  Logo,
  Module,
  ModuleAdapter,
  ModuleMetadata,
  PeerRequirement,
  RegistryIndex,
  TemplateRef,
} from "./module";
export { defineModule, ModuleMetadataSchema, ModuleSchema, RegistryIndexSchema } from "./module";
