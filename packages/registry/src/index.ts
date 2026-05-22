export type {
  Slot,
  SlotId,
  AddonCategory,
  AddonCategoryId,
  ModuleId,
  PeerRequirement,
  Module,
  SlotModule,
  AddonModule,
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
  isAddon,
  moduleGroup,
  KNOWN_SLOTS,
  KNOWN_ADDONS,
  SLOT_PACKAGE_DIR,
  ADDON_PACKAGE_DIR,
  SLOTS,
  ADDON_CATEGORIES,
  slotLabel,
  addonLabel,
  groupLabel,
} from "./module";

export type {
  StanzaManifest,
  StanzaModuleRecord,
  StanzaAddonRecord,
  RegionMap,
  RegionOwnership,
} from "./manifest";
export {
  StanzaManifestSchema,
  CURRENT_MANIFEST_VERSION,
  MANIFEST_SCHEMA_URL,
  emptyManifest,
  manifestJsonSchema,
} from "./manifest";

export type { ResolveContext, ResolveResult, ResolveError } from "./resolver";
export { resolveAdapter, isCompatible, slotOrder, addonOrder } from "./resolver";

export type {
  PackageManager,
  PackageJson,
  MergedInstallFields,
  ResolvedEntry,
  ResolvedSlots,
  ResolvedAddons,
} from "./package-json";
export {
  mergeInstallFields,
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
} from "./synthesize";
