import type { AppSpec } from "./manifest";
import { PACKAGE_DIRS } from "./module";

/**
 * Mustache-style context consumed by {@link renderTemplate}. The shape is the
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
 *
 * `app.*` is rebound per target app on every render pass, so a module installed
 * into two apps renders correctly in each.
 */
export type TemplateContext = {
  project: { name: string };
  app: { id: string; dir: string; kind: string };
  package: { name: string };
  packages: Record<string, { name: string }>;
};

/**
 * Resolve `{{ a.b.c }}` references against a {@link TemplateContext}. Pure
 * regex + path walk — no helpers, no logic. Templates that need branching
 * should live as separate files and the codemod picks which one to render.
 *
 * Throws on missing keys so silent stub-outs can't ship to users. The CLI's
 * apply path and the web preview share this primitive, so a fresh `{{ ... }}`
 * with a typo fails the same way in both.
 */
export function renderTemplate(source: string, context: TemplateContext): string {
  return source.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    const value = key.split(".").reduce<unknown>((acc, part) => {
      if (acc !== null && typeof acc === "object" && part in acc) {
        return Reflect.get(acc, part);
      }
      return undefined;
    }, context);
    if (typeof value !== "string") {
      throw new Error(`renderTemplate: missing or non-string key "${key}"`);
    }
    return value;
  });
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
 */
export function buildRenderContext(opts: {
  projectName: string;
  app: AppSpec;
  packageName: string;
}): TemplateContext {
  const packages: Record<string, { name: string }> = {};
  for (const dir of PACKAGE_DIRS) {
    packages[dir] = { name: `@${opts.projectName}/${dir}` };
  }
  return {
    project: { name: opts.projectName },
    app: { id: opts.app.id, dir: opts.app.dir, kind: opts.app.kind },
    package: { name: opts.packageName },
    packages,
  };
}
