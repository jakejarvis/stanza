import {
  type AppSpec,
  defaultWebApp,
  emptyManifest,
  type StanzaManifest,
  type StanzaModuleRecord,
} from "./manifest";
import {
  categoryHome,
  type CategoryId,
  categoryLabel,
  type InstallHome,
  isMulti,
  type ModuleId,
  type TemplateRef,
} from "./module";
import {
  mergeInstallFields,
  type PackageManager,
  type Resolved,
  type ResolvedEntry,
  type SynthesizeEntry,
} from "./package-json";
import { categoryOrder } from "./resolver";
import { buildRenderContext, pmRun, renderTemplate } from "./template";

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
 * name/apps) and per-category module records (arrays). App-home records carry
 * `apps: [...]` so the resulting manifest validates against the schema.
 *
 * `regions` is intentionally left empty: it's internal per-file ownership
 * bookkeeping the CLI accretes as it claims templates, deps, env keys, and
 * codemod edits. Faithfully reproducing the codemod-derived claims would mean
 * duplicating codemod-internal path logic here, so the preview presents the
 * manifest as a stack summary rather than the literal on-disk region map.
 */
export function synthesizeManifest(
  resolved: Resolved,
  opts: { name: string; apps?: AppSpec[]; packageManager?: PackageManager },
): StanzaManifest {
  const apps = opts.apps && opts.apps.length > 0 ? opts.apps : [defaultWebApp()];
  const base = emptyManifest({
    name: opts.name,
    apps,
    packageManager: opts.packageManager,
  });

  const modules: StanzaManifest["modules"] = {};
  for (const category of categoryOrder) {
    const entries = resolved[category];
    if (!entries?.length) continue;
    const home = categoryHome(category);
    modules[category] = entries.map((entry) => {
      const record: StanzaModuleRecord = {
        id: entry.module.id,
        version: entry.module.version,
        adapter: entry.adapter.key,
      };
      // App-home: tag with every project app by default (preview-time we don't
      // know which one the user picked). Package-home: leave `apps` omitted so
      // shims ship into all apps. Repo-home: leave omitted.
      if (home.kind === "app") record.apps = apps.map((a) => a.id);
      return record;
    });
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

/**
 * Compute every template file stanza would write for a resolved selection,
 * with mustache substitution applied. Mirrors the CLI's apply path so the web
 * preview is byte-identical to what the CLI actually writes.
 *
 * For each `scope: "app"` template, the function iterates the entry's targeted
 * apps (or all project apps when the entry omits `apps`) and emits one path
 * per app, with a fresh render context bound to that app. `scope: "package"`
 * and `scope: "repo"` are app-agnostic and emit a single path each.
 *
 * Returns content from `tpl.content` only — never touches disk, so the
 * registry package stays node-free for client/server bundles. Local-dev
 * disk fallback is the CLI runner's concern.
 */
export function synthesizeTemplates(
  resolved: Partial<Record<CategoryId, SynthesizeEntry[]>>,
  opts: {
    name: string;
    apps?: AppSpec[];
    packageManager?: PackageManager;
    peers?: Partial<Record<CategoryId, string>>;
  },
): SynthesizedTemplate[] {
  const apps = opts.apps && opts.apps.length > 0 ? opts.apps : [defaultWebApp()];
  const out: SynthesizedTemplate[] = [];

  const targetsFor = (entry: SynthesizeEntry): AppSpec[] => {
    if (!entry.apps?.length) return apps;
    const allowed = new Set(entry.apps);
    return apps.filter((a) => allowed.has(a.id));
  };

  // Aggregate env names from every resolved entry's merged install fields,
  // including the `app` overlay. Mirrors what the CLI runner derives from
  // `manifest.regions[".env.example"]` post-apply — both ends feed the same
  // sorted/deduped array into `{{env}}`, so turbo.json `globalEnv` and any
  // other env-aware template render identically across CLI and web preview.
  const envNames: string[] = [];
  for (const category of categoryOrder) {
    for (const entry of resolved[category] ?? []) {
      const fields = mergeInstallFields(entry.module, entry.adapter);
      for (const v of fields.env) envNames.push(v.name);
      for (const v of fields.app.env) envNames.push(v.name);
    }
  }

  for (const category of categoryOrder) {
    const home = categoryHome(category);
    const packageName = home.kind === "package" ? `@${opts.name}/${home.dir}` : "";

    for (const entry of resolved[category] ?? []) {
      // Each app gets its own render context so `{{ app.* }}` resolves to the
      // active target — that's how a single module installed into multiple apps
      // renders correctly per app.
      const renderForApp = (app: AppSpec) =>
        buildRenderContext({
          projectName: opts.name,
          app,
          packageName,
          packageManager: opts.packageManager,
          peers: opts.peers,
          envNames,
          consumesPackages: entry.module.consumesPackages,
        });

      for (const tpl of entry.adapter.templates ?? []) {
        const source = tpl.content ?? "";
        if (tpl.scope === "app") {
          for (const app of targetsFor(entry)) {
            const content = tpl.template ? renderTemplate(source, renderForApp(app)) : source;
            out.push({
              path: resolveTemplatePath(tpl, home, app),
              content,
              owner: { category, module: entry.module.id },
            });
          }
          continue;
        }
        // Repo- or package-scoped — app-agnostic. Pick the first targeted app
        // to seed the render context (`app.*` is just metadata; nothing under
        // packages/* should reference it, but it has to be a valid AppSpec).
        const seedApp = targetsFor(entry)[0] ?? apps[0]!;
        const content = tpl.template ? renderTemplate(source, renderForApp(seedApp)) : source;
        out.push({
          path: resolveTemplatePath(tpl, home, seedApp),
          content,
          owner: { category, module: entry.module.id },
        });
      }
    }
  }

  return out;
}

function resolveTemplatePath(tpl: TemplateRef, home: InstallHome, app: AppSpec): string {
  if (tpl.scope === "repo") return tpl.dest;
  if (tpl.scope === "package") {
    // Defensive: a `scope: "package"` ref under a non-package category would be
    // rejected by the CLI runner. Fall back to repo root here so the preview
    // doesn't throw while the user is mid-edit.
    return home.kind === "package" ? `packages/${home.dir}/${tpl.dest}` : tpl.dest;
  }
  return `${app.dir.replace(/\/$/, "")}/${tpl.dest}`;
}

/**
 * Compose the project's `README.md` from the resolved selection — header with
 * the project name, a stack summary table, getting-started commands, and a
 * section per installed module rendered from each module's `readme` field
 * (Handlebars against the standard render context). Modules without a `readme`
 * fall back to their `description` so every selection still produces a
 * section.
 *
 * Pure function of the resolved selection, mirroring `synthesizeEnvExample` /
 * `synthesizeManifest` — so the CLI's apply path and the web preview produce
 * byte-identical output for the same inputs.
 */
export function synthesizeReadme(
  resolved: Resolved,
  opts: {
    name: string;
    apps?: AppSpec[];
    packageManager?: PackageManager;
    peers?: Partial<Record<CategoryId, string>>;
  },
): string {
  const apps = opts.apps && opts.apps.length > 0 ? opts.apps : [defaultWebApp()];
  const pm: PackageManager = opts.packageManager ?? "pnpm";
  const peers = opts.peers ?? {};
  const hasEnv = synthesizeEnvExample(resolved).length > ENV_EXAMPLE_HEADER.length;

  const lines: string[] = [];
  lines.push(`# ${opts.name}`);
  lines.push("");
  lines.push("Generated with [Stanza](https://stanza.tools).");
  lines.push("");

  // Stack summary table — only categories with at least one selection.
  const stackRows: { label: string; modules: string }[] = [];
  for (const category of categoryOrder) {
    const entries = resolved[category];
    if (!entries?.length) continue;
    stackRows.push({
      label: categoryLabel(category),
      modules: entries.map((e) => e.module.label).join(isMulti(category) ? ", " : ""),
    });
  }
  if (stackRows.length > 0) {
    lines.push("## Stack");
    lines.push("");
    lines.push("| Category | Module |");
    lines.push("| --- | --- |");
    for (const row of stackRows) lines.push(`| ${row.label} | ${row.modules} |`);
    lines.push("");
  }

  lines.push("## Getting started");
  lines.push("");
  lines.push("```sh");
  lines.push(`${pm} install`);
  lines.push(pmRun(pm, "dev"));
  lines.push("```");
  lines.push("");
  if (hasEnv) {
    lines.push("Copy `.env.example` to `.env` and fill in the values before starting.");
    lines.push("");
  }

  // Per-module sections, in topological category order. Each renders the
  // module's `readme` (Handlebars against the standard context) or falls back
  // to its `description` when none is provided. Repo/package-home modules use
  // the first targeted app to seed the render context (same trick
  // `synthesizeTemplates` uses for app-agnostic templates).
  const hasModules = categoryOrder.some((c) => (resolved[c]?.length ?? 0) > 0);
  if (hasModules) {
    // Same aggregation as `synthesizeTemplates` so a module readme can read
    // `{{env}}` and see the full project-wide list.
    const envNames: string[] = [];
    for (const cat of categoryOrder) {
      for (const entry of resolved[cat] ?? []) {
        const fields = mergeInstallFields(entry.module, entry.adapter);
        for (const v of fields.env) envNames.push(v.name);
        for (const v of fields.app.env) envNames.push(v.name);
      }
    }

    lines.push("## Modules");
    lines.push("");
    for (const category of categoryOrder) {
      const home = categoryHome(category);
      const packageName = home.kind === "package" ? `@${opts.name}/${home.dir}` : "";
      for (const entry of resolved[category] ?? []) {
        const targetApps = appsForEntry(entry, apps);
        const seedApp = targetApps[0] ?? apps[0]!;
        const ctx = buildRenderContext({
          projectName: opts.name,
          app: seedApp,
          packageName,
          packageManager: pm,
          peers,
          envNames,
          consumesPackages: entry.module.consumesPackages,
        });
        lines.push(`### ${categoryLabel(category)} — ${entry.module.label}`);
        lines.push("");
        const body = entry.module.readme
          ? renderTemplate(entry.module.readme, ctx).trim()
          : `> ${entry.module.description}`;
        lines.push(body);
        lines.push("");
      }
    }
  }

  return lines.join("\n").replace(/\n+$/, "\n");
}

/**
 * Apps an entry targets, defaulting to every project app when `entry.apps` is
 * absent. Mirrors `synthesizeTemplates`' filter so the README's seed app
 * agrees with what the templates render against.
 */
function appsForEntry(entry: ResolvedEntry, apps: AppSpec[]): AppSpec[] {
  const withApps = entry as SynthesizeEntry;
  if (!withApps.apps?.length) return apps;
  const allowed = new Set(withApps.apps);
  return apps.filter((a) => allowed.has(a.id));
}
