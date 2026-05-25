import Handlebars from "handlebars";

import type { AppSpec } from "./manifest";
import { type CategoryId, PACKAGE_DIRS, PEER_CATEGORIES } from "./module";
import type { PackageManager } from "./package-json";

/**
 * Handlebars context consumed by {@link renderTemplate}. The shape is the
 * public contract template authors write against:
 *
 *   {{ project.name }}        — the manifest's `name` (a.k.a. the npm scope)
 *   {{ app.id }}              — the active app's id, e.g. "web"
 *   {{ app.dir }}             — the active app's dir, e.g. "apps/web"
 *   {{ app.kind }}            — "web" | "native"
 *   {{ package.name }}        — the active module's own package (e.g. "@my-app/auth").
 *                               Empty string for categories whose `home.kind` isn't "package".
 *   {{ packages.<dir>.name }} — any other package by its dir, e.g. {{ packages.db.name }}
 *                               → "@my-app/db". One entry per `PACKAGE_DIRS` member.
 *   {{ peers.<category> }}    — id of the active one-cardinality module in that
 *                               category, or undefined. Useful with the `eq`
 *                               helper for conditional blocks:
 *                               {{#if (eq peers.framework "next")}}…{{/if}}
 *   {{ pm }}                  — project's package manager id ("pnpm" | "bun" |
 *                               "npm"). Use in shell commands so docs and
 *                               error messages match the user's chosen pm.
 *
 * `app.*` is rebound per target app on every render pass, so a module installed
 * into two apps renders correctly in each.
 */
export type TemplateContext = {
  project: { name: string };
  app: { id: string; dir: string; kind: string };
  package: { name: string };
  packages: Record<string, { name: string }>;
  peers: Partial<Record<CategoryId, string>>;
  pm: PackageManager;
};

/**
 * Compose a "run a package.json script" invocation for the given pm. npm
 * requires the `run` keyword (`npm run dev`); pnpm and bun accept the script
 * name directly (`pnpm dev`, `bun dev`). Shared by the `{{run}}` Handlebars
 * helper and by `synthesizeReadme`'s getting-started block so docs and synth
 * agree on the exact command shape.
 */
export function pmRun(pm: PackageManager, script: string): string {
  return pm === "npm" ? `npm run ${script}` : `${pm} ${script}`;
}

// Module-singleton instance so registered helpers don't leak into other
// Handlebars consumers (the global is shared otherwise).
const hb = Handlebars.create();

// String-equality helper for matching against a peer id, e.g.
//   {{#if (eq peers.framework "next")}}…{{/if}}
hb.registerHelper("eq", (a: unknown, b: unknown) => a === b);

// pm-aware script invocation, e.g. `{{run "dev"}}` → `pnpm dev` / `bun dev` /
// `npm run dev`. Reads the active pm from the current data context.
hb.registerHelper("run", function (this: TemplateContext, script: unknown): string {
  if (typeof script !== "string") return "";
  return pmRun(this.pm, script);
});

/**
 * Render a Handlebars template against a {@link TemplateContext}. Output is
 * never HTML-escaped (`noEscape: true`) because templates emit code (JS/TS/
 * JSON), not markup.
 *
 * Missing keys render as empty strings (Handlebars' default non-strict
 * behavior). The CLI's apply path and the web preview share this primitive,
 * so substitutions resolve identically in both.
 */
export function renderTemplate(source: string, context: TemplateContext): string {
  const template = hb.compile(source, { noEscape: true });
  return template(context);
}

/**
 * Build the {@link TemplateContext} used by both template-body substitution
 * (CLI apply path + web preview) and codemod-args substitution (CLI only).
 * Takes a plain options bag rather than a `StanzaManifest` so the web's
 * URL-derived "virtual manifest" can call it without a real on-disk file.
 *
 * Each (module, target-app) iteration in the runner builds a fresh context so
 * `app.*` points at the currently-applying app — that's how the same module's
 * templates land correctly when shipped into multiple apps.
 *
 * Every `PEER_CATEGORIES` key is materialized under `peers` (with `undefined`
 * when no module is selected) so templates can safely reference any peer slot
 * — that lets `{{peers.framework}}` resolve to `undefined` rather than walk
 * off the end of a missing path.
 */
export function buildRenderContext(opts: {
  projectName: string;
  app: AppSpec;
  packageName: string;
  packageManager?: PackageManager;
  peers?: Partial<Record<CategoryId, string>>;
}): TemplateContext {
  const packages: Record<string, { name: string }> = {};
  for (const dir of PACKAGE_DIRS) {
    packages[dir] = { name: `@${opts.projectName}/${dir}` };
  }
  const peers: Partial<Record<CategoryId, string>> = {};
  for (const cat of PEER_CATEGORIES) peers[cat] = opts.peers?.[cat];
  return {
    project: { name: opts.projectName },
    app: { id: opts.app.id, dir: opts.app.dir, kind: opts.app.kind },
    package: { name: opts.packageName },
    packages,
    peers,
    pm: opts.packageManager ?? "pnpm",
  };
}
