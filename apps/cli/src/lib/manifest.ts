import fs from "node:fs";
import path from "node:path";

import { StanzaManifestSchema, type StanzaManifest, emptyManifest } from "@stanza/registry";

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
  return parsed.data;
}

export function writeManifest(projectRoot: string, manifest: StanzaManifest): void {
  const file = manifestPath(projectRoot);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n", "utf8");
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
  appDir?: string;
  packageManager?: StanzaManifest["packageManager"];
}): StanzaManifest {
  const m = emptyManifest({
    name: input.name,
    appDir: input.appDir,
    packageManager: input.packageManager,
  });
  writeManifest(input.projectRoot, m);
  return m;
}
