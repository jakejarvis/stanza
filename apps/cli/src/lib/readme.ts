import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { Resolved, ResolvedEntry, StanzaManifest } from "@stanza/registry";
import { activePeerIds, categoryOrder, synthesizeReadme } from "@stanza/registry";

import type { Registries } from "./registry-loader";

const README_FILENAME = "README.md";

export function readmeChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function readmePath(projectRoot: string): string {
  return path.join(projectRoot, README_FILENAME);
}

export function readReadmeIfExists(projectRoot: string): string | undefined {
  const file = readmePath(projectRoot);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
}

/**
 * True when the project's README has been edited (or pre-existed before
 * Stanza took ownership). The check compares the file's SHA-256 against the
 * manifest's `readmeChecksum`: a mismatch means the user touched it. An
 * absent stored checksum with a present file is also treated as user-owned
 * (conservative — covers legacy projects and foreign READMEs).
 */
export function userModifiedReadme(projectRoot: string, manifest: StanzaManifest): boolean {
  const onDisk = readReadmeIfExists(projectRoot);
  if (onDisk === undefined) return false;
  if (manifest.readmeChecksum === undefined) return true;
  return readmeChecksum(onDisk) !== manifest.readmeChecksum;
}

/**
 * Write a freshly-generated README — used by `stanza init` where the project
 * directory is guaranteed empty, so no edit check is needed. Returns the
 * SHA-256 to record on the manifest's `readmeChecksum`.
 */
export function writeFreshReadme(projectRoot: string, content: string, dryRun: boolean): string {
  if (!dryRun) fs.writeFileSync(readmePath(projectRoot), content, "utf8");
  return readmeChecksum(content);
}

export type ReadmeRegenStatus = "written" | "skipped" | "dry-run";

/**
 * Re-synthesize the README from the current manifest and write it back,
 * **unless** the user has edited the file. Reloads each installed module
 * from the registry so the synth picks up the latest `readme`/`description`
 * copy. `stanza add` and `stanza remove` call this after their mutations
 * complete; init uses {@link writeFreshReadme} directly.
 */
export async function regenerateReadmeIfUnmodified(args: {
  projectRoot: string;
  manifest: StanzaManifest;
  registry: Registries;
  dryRun: boolean;
}): Promise<{ manifest: StanzaManifest; status: ReadmeRegenStatus }> {
  if (userModifiedReadme(args.projectRoot, args.manifest)) {
    return { manifest: args.manifest, status: "skipped" };
  }

  const resolved: Resolved = {};
  for (const category of categoryOrder) {
    const records = args.manifest.modules[category] ?? [];
    if (records.length === 0) continue;
    const entries: ResolvedEntry[] = [];
    for (const record of records) {
      const mod = await args.registry
        .loadModule(category, record.id, record.namespace)
        .catch(() => null);
      if (!mod) continue;
      const adapter = mod.adapters.find((a) => a.key === record.adapter) ?? mod.adapters[0];
      if (!adapter) continue;
      entries.push({ module: mod, adapter });
    }
    if (entries.length > 0) resolved[category] = entries;
  }

  const content = synthesizeReadme(resolved, {
    name: args.manifest.name,
    apps: args.manifest.apps,
    packageManager: args.manifest.packageManager,
    peers: activePeerIds(args.manifest),
  });

  if (args.dryRun) return { manifest: args.manifest, status: "dry-run" };

  fs.writeFileSync(readmePath(args.projectRoot), content, "utf8");
  return {
    manifest: { ...args.manifest, readmeChecksum: readmeChecksum(content) },
    status: "written",
  };
}
