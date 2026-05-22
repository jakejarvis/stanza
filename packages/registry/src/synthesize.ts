import { emptyManifest, type StanzaManifest } from "./manifest";
import {
  categoryHome,
  type CategoryId,
  type InstallHome,
  type ModuleId,
  type TemplateRef,
} from "./module";
import {
  mergeInstallFields,
  type PackageManager,
  type Resolved,
  type ResolvedEntry,
} from "./package-json";
import { categoryOrder } from "./resolver";
import { buildRenderContext, renderTemplate } from "./template";

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
 * the managed header followed by every module's env vars, in `categoryOrder`.
 * Mirrors the CLI apply path, so the preview matches what `stanza init`
 * produces byte-for-byte.
 */
export function synthesizeEnvExample(resolved: Resolved): string {
  let out = ENV_EXAMPLE_HEADER;
  const apply = (entry: ResolvedEntry) => {
    for (const v of mergeInstallFields(entry.module, entry.adapter).env) {
      out = appendEnvVar(out, v.name, v.example, v.description);
    }
  };
  for (const category of categoryOrder) {
    for (const entry of resolved[category] ?? []) apply(entry);
  }
  return out;
}

/**
 * Compute the `stanza.json` manifest for a resolved selection — the same shape
 * the CLI pins at install time: header (version/projectShape/packageManager/
 * name/appDir) and per-category module records (arrays).
 *
 * `regions` is intentionally left empty: it's internal per-file ownership
 * bookkeeping the CLI accretes as it claims templates, deps, env keys, and
 * codemod edits. Faithfully reproducing the codemod-derived claims would mean
 * duplicating codemod-internal path logic here, so the preview presents the
 * manifest as a stack summary rather than the literal on-disk region map.
 */
export function synthesizeManifest(
  resolved: Resolved,
  opts: { name: string; appDir?: string; packageManager?: PackageManager },
): StanzaManifest {
  const base = emptyManifest({
    name: opts.name,
    appDir: opts.appDir,
    packageManager: opts.packageManager,
  });

  const modules: StanzaManifest["modules"] = {};
  for (const category of categoryOrder) {
    const entries = resolved[category];
    if (!entries?.length) continue;
    modules[category] = entries.map((entry) => ({
      id: entry.module.id,
      version: entry.module.version,
      adapter: entry.adapter.key,
    }));
  }

  return { ...base, modules };
}

export type SynthesizedTemplate = {
  /** Path relative to the generated project root. */
  path: string;
  /** Final content stanza would write — substitution already applied for `template: true` refs. */
  content: string;
  owner: { category: CategoryId; module: ModuleId };
};

const DEFAULT_APP_DIR = "apps/web";

/**
 * Compute every template file stanza would write for a resolved selection,
 * with mustache substitution applied. Mirrors the CLI's apply path so the web
 * preview is byte-identical to what the CLI actually writes.
 *
 * Each resolved module gets a fresh render context: `package.name` and the
 * active package's slot in `packages.<dir>.name` resolve to the owning
 * module's own package. Templates with `template: true` go through
 * `renderTemplate`; raw templates pass through untouched.
 *
 * Returns content from `tpl.content` only — never touches disk, so the
 * registry package stays node-free for client/server bundles. Local-dev
 * disk fallback is the CLI runner's concern.
 */
export function synthesizeTemplates(
  resolved: Resolved,
  opts: { name: string; appDir?: string },
): SynthesizedTemplate[] {
  const appDir = opts.appDir ?? DEFAULT_APP_DIR;
  const out: SynthesizedTemplate[] = [];

  for (const category of categoryOrder) {
    const home = categoryHome(category);
    const packageName = home.kind === "package" ? `@${opts.name}/${home.dir}` : "";
    const renderContext = buildRenderContext({
      projectName: opts.name,
      appDir,
      packageName,
    });

    for (const entry of resolved[category] ?? []) {
      for (const tpl of entry.adapter.templates ?? []) {
        const source = tpl.content ?? "";
        const content = tpl.template ? renderTemplate(source, renderContext) : source;
        out.push({
          path: resolveTemplatePath(tpl, home, appDir),
          content,
          owner: { category, module: entry.module.id },
        });
      }
    }
  }

  return out;
}

function resolveTemplatePath(tpl: TemplateRef, home: InstallHome, appDir: string): string {
  if (tpl.scope === "repo") return tpl.dest;
  if (tpl.scope === "package") {
    // Defensive: a `scope: "package"` ref under a non-package category would be
    // rejected by the CLI runner. Fall back to repo root here so the preview
    // doesn't throw while the user is mid-edit.
    return home.kind === "package" ? `packages/${home.dir}/${tpl.dest}` : tpl.dest;
  }
  return `${appDir.replace(/\/$/, "")}/${tpl.dest}`;
}
