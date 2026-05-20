import type { StanzaManifest } from "@stanza/registry";

/**
 * Region ownership operations on a manifest. Pure functions that return a
 * new manifest — call sites are responsible for persisting via writeManifest.
 */

export class RegionConflictError extends Error {
  constructor(
    public readonly file: string,
    public readonly region: string,
    public readonly existingOwner: string,
    public readonly newOwner: string,
  ) {
    super(
      `Region conflict in ${file}/${region}: already owned by "${existingOwner}", "${newOwner}" tried to claim`,
    );
    this.name = "RegionConflictError";
  }
}

export function claim(
  manifest: StanzaManifest,
  file: string,
  region: string,
  owner: string,
): StanzaManifest {
  const current = manifest.regions[file]?.[region];
  if (current && current !== owner) {
    throw new RegionConflictError(file, region, current, owner);
  }
  return {
    ...manifest,
    regions: {
      ...manifest.regions,
      [file]: { ...manifest.regions[file], [region]: owner },
    },
  };
}

export function release(manifest: StanzaManifest, file: string, region: string): StanzaManifest {
  const fileRegions = manifest.regions[file];
  if (!fileRegions) return manifest;

  const next: Record<string, string> = { ...fileRegions };
  delete next[region];

  const regions = { ...manifest.regions };
  if (Object.keys(next).length === 0) {
    delete regions[file];
  } else {
    regions[file] = next;
  }

  return { ...manifest, regions };
}

export function regionsOwnedBy(
  manifest: StanzaManifest,
  owner: string,
): { file: string; region: string }[] {
  const out: { file: string; region: string }[] = [];
  for (const [file, regions] of Object.entries(manifest.regions)) {
    for (const [region, value] of Object.entries(regions)) {
      if (value === owner) out.push({ file, region });
    }
  }
  return out;
}
