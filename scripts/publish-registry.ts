/**
 * Publishes the registry + manifest JSON Schema to Vercel Blob, the single
 * origin behind the path-transparent `stanza.tools/registry/*.json` and
 * `stanza.tools/schema*.json` rewrites. Runs on every push to `main`, so a
 * registry change goes live without a release. Blob layout:
 *
 *   registry/index.json                  latest index (overwrite)
 *   registry/<category>-<id>.json        latest module (overwrite)
 *   registry/<category>-<id>@<ver>.json  immutable module pin (write-if-absent)
 *   schema.json                          latest schema (overwrite)
 *   schema@<ver>.json                    immutable schema pin (write-if-absent)
 *
 * "Latest" files overwrite each run; version pins are written once and skipped
 * if already published (immutable — reproducing a pinned `stanza.json` relies
 * on them never changing). Drift (changed content under an existing version) is
 * caught on PRs by `check-module-versions.ts`.
 *
 * Run via `jiti scripts/publish-registry.ts` (reads `BLOB_READ_WRITE_TOKEN`).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { head, put } from "@vercel/blob";
import { compileManifestJsonSchema } from "@withstanza/schema";

import { compileRegistry } from "./compile-registry.ts";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("BLOB_READ_WRITE_TOKEN is required to publish the registry.");
  process.exit(1);
}

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-publish-"));
await compileRegistry({ outDir });

async function exists(pathname: string): Promise<boolean> {
  try {
    await head(pathname, { token });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "BlobNotFoundError") return false;
    throw err;
  }
}

function upload(pathname: string, content: string, allowOverwrite: boolean): Promise<unknown> {
  return put(pathname, content, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite,
    contentType: "application/json",
    token,
  });
}

/** Refresh `<base>.json` (overwrite) + write the immutable `<base>@<version>.json` pin once. */
async function publish(base: string, version: string, content: string): Promise<boolean> {
  await upload(`${base}.json`, content, true);
  const pin = `${base}@${version}.json`;
  const fresh = !(await exists(pin));
  if (fresh) await upload(pin, content, false);
  return fresh;
}

// Modules: every compiled `<slug>.json` (the filename is the slug). `index.json`
// is the registry main file — uploaded as latest only (it carries the
// nondeterministic `generatedAt`, so it isn't version-pinned).
let newPins = 0;
for (const file of fs.readdirSync(outDir)) {
  if (file === "index.json") continue;
  const slug = file.replace(/\.json$/, "");
  const text = fs.readFileSync(path.join(outDir, file), "utf8");
  const { version }: { version: string } = JSON.parse(text);
  if (await publish(`registry/${slug}`, version, text)) newPins++;
}

await upload("registry/index.json", fs.readFileSync(path.join(outDir, "index.json"), "utf8"), true);

const { version: schemaVersion }: { version: string } = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "packages", "schema", "package.json"), "utf8"),
);
const schemaJson = `${JSON.stringify(compileManifestJsonSchema(), null, 2)}\n`;
if (await publish("schema", schemaVersion, schemaJson)) newPins++;

console.log(`Published registry latest + ${newPins} new version pin(s).`);
