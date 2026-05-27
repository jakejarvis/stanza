import fs from "node:fs";
import path from "node:path";

import {
  type AppSpec,
  CURRENT_MANIFEST_VERSION,
  emptyManifest,
  MANIFEST_SCHEMA_URL,
  StanzaManifestSchema,
  type StanzaManifest,
} from "@stanza/registry";

const MANIFEST_FILENAME = "stanza.json";

export function manifestPath(projectRoot: string): string {
  return path.join(projectRoot, MANIFEST_FILENAME);
}

export function readManifest(projectRoot: string): StanzaManifest {
  const file = manifestPath(projectRoot);
  if (!fs.existsSync(file)) {
    throw new Error(`No stanza.json found in ${projectRoot}. Run \`stanza init\` first.`);
  }
  const parsed = StanzaManifestSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(
      `Malformed stanza.json:\n${parsed.error.issues
        .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }
  // Re-stamp the version so the in-memory object always reflects the current
  // schema. Past-version manifests parsed via SUPPORTED_MANIFEST_VERSIONS get
  // upgraded transparently; the next `writeManifest` persists it.
  return { ...parsed.data, version: CURRENT_MANIFEST_VERSION };
}

export function writeManifest(projectRoot: string, manifest: StanzaManifest): void {
  const file = manifestPath(projectRoot);
  // Spread the constant first so `$schema` lands at the top and pre-existing
  // manifests gain it on their next write; an explicit `$schema` still wins.
  const withSchema = { $schema: MANIFEST_SCHEMA_URL, ...manifest };
  fs.writeFileSync(file, JSON.stringify(withSchema, null, 2) + "\n", "utf8");
}

export function findProjectRoot(cwd: string = process.cwd()): string | undefined {
  let dir = path.resolve(cwd);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, MANIFEST_FILENAME))) return dir;
    dir = path.dirname(dir);
  }
  return undefined;
}

export function initManifest(input: {
  projectRoot: string;
  name: string;
  apps?: AppSpec[];
  packageManager?: StanzaManifest["packageManager"];
}): StanzaManifest {
  const m = emptyManifest({
    name: input.name,
    apps: input.apps,
    packageManager: input.packageManager,
  });
  writeManifest(input.projectRoot, m);
  return m;
}
