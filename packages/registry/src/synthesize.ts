import { emptyManifest, type StanzaManifest } from "./manifest";
import {
  mergeInstallFields,
  type PackageManager,
  type ResolvedAddons,
  type ResolvedEntry,
  type ResolvedSlots,
} from "./package-json";
import { addonOrder, slotOrder } from "./resolver";

/** Header `stanza init` writes at the top of `.env.example`. */
export const ENV_EXAMPLE_HEADER = "# Stanza-managed environment variables.\n";

/**
 * Idempotently append an env var to `.env.example`-style text, returning the
 * new contents. Pure (no fs) so it backs both the CLI's `addEnvVar` and the
 * web builder's preview synthesis — the single source of truth for env-file
 * formatting. Updates an existing var in place; otherwise appends with a blank
 * line separator and an optional leading `# description` comment.
 */
export function appendEnvVar(
  contents: string,
  name: string,
  example: string,
  description?: string,
): string {
  const lines = contents.split("\n");
  const existingIdx = lines.findIndex((line) => line.replace(/^#\s*/, "").startsWith(`${name}=`));
  const entry = description ? `# ${description}\n${name}=${example}` : `${name}=${example}`;

  if (existingIdx >= 0) {
    const prev = lines[existingIdx - 1];
    if (description && prev?.startsWith("#")) {
      lines.splice(existingIdx - 1, 2, ...entry.split("\n"));
    } else {
      lines.splice(existingIdx, 1, ...entry.split("\n"));
    }
  } else {
    if (contents.length > 0 && !contents.endsWith("\n")) lines.push("");
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    lines.push(...entry.split("\n"));
  }

  return lines.join("\n").replace(/\n+$/, "\n");
}

/**
 * Compute the `.env.example` stanza would write for a resolved selection:
 * the managed header followed by every module's env vars, in the same order
 * the CLI applies modules (slots first, then add-ons). Mirrors the CLI apply
 * path, so the preview matches what `stanza init` produces byte-for-byte.
 */
export function synthesizeEnvExample(slots: ResolvedSlots, addons: ResolvedAddons): string {
  let out = ENV_EXAMPLE_HEADER;
  const apply = (entry: ResolvedEntry) => {
    for (const v of mergeInstallFields(entry.module, entry.adapter).env) {
      out = appendEnvVar(out, v.name, v.example, v.description);
    }
  };
  for (const slot of slotOrder) {
    const entry = slots[slot];
    if (entry) apply(entry);
  }
  for (const category of addonOrder) {
    for (const entry of addons[category] ?? []) apply(entry);
  }
  return out;
}

/**
 * Compute the `stanza.json` manifest for a resolved selection — the same shape
 * the CLI pins at install time: header (version/projectShape/packageManager/
 * name/appDir), one record per filled slot, and per-category add-on records.
 *
 * `regions` is intentionally left empty: it's internal per-file ownership
 * bookkeeping the CLI accretes as it claims templates, deps, env keys, and
 * codemod edits. Faithfully reproducing the codemod-derived claims would mean
 * duplicating codemod-internal path logic here, so the preview presents the
 * manifest as a stack summary rather than the literal on-disk region map.
 */
export function synthesizeManifest(
  slots: ResolvedSlots,
  addons: ResolvedAddons,
  opts: { name: string; appDir?: string; packageManager?: PackageManager },
): StanzaManifest {
  const base = emptyManifest({
    name: opts.name,
    appDir: opts.appDir,
    packageManager: opts.packageManager,
  });

  const modules: StanzaManifest["modules"] = {};
  for (const slot of slotOrder) {
    const entry = slots[slot];
    if (!entry) continue;
    modules[slot] = {
      id: entry.module.id,
      version: entry.module.version,
      adapter: entry.adapter.key,
    };
  }

  const addonRecords: StanzaManifest["addons"] = {};
  for (const category of addonOrder) {
    const entries = addons[category];
    if (!entries?.length) continue;
    addonRecords[category] = entries.map((entry) => ({
      id: entry.module.id,
      version: entry.module.version,
      adapter: entry.adapter.key,
    }));
  }

  return { ...base, modules, addons: addonRecords };
}
