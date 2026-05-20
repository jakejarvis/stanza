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
} from "./module.ts";
export { defineModule, KNOWN_SLOTS } from "./module.ts";

export type { StanzaManifest, StanzaModuleRecord, RegionMap, RegionOwnership } from "./manifest.ts";
export { StanzaManifestSchema, CURRENT_MANIFEST_VERSION, emptyManifest } from "./manifest.ts";

export type { ResolveContext, ResolveResult, ResolveError } from "./resolver.ts";
export { resolveAdapter, isCompatible, slotOrder } from "./resolver.ts";
