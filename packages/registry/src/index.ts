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
export { StanzaManifestSchema, CURRENT_MANIFEST_VERSION, emptyManifest } from "./manifest";

export type { ResolveContext, ResolveResult, ResolveError } from "./resolver";
export { resolveAdapter, isCompatible, slotOrder, addonOrder } from "./resolver";
