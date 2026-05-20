export type {
  Slot,
  SlotId,
  ModuleId,
  Capability,
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
export { defineModule, KNOWN_SLOTS, SLOT_PACKAGE_DIR } from "./module";

export type { StanzaManifest, StanzaModuleRecord, RegionMap, RegionOwnership } from "./manifest";
export { StanzaManifestSchema, CURRENT_MANIFEST_VERSION, emptyManifest } from "./manifest";

export type { ResolveContext, ResolveResult, ResolveError } from "./resolver";
export { resolveAdapter, isCompatible, slotOrder } from "./resolver";
