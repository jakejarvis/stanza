import fs from "node:fs";
import path from "node:path";

import { openProject } from "@stanza/codemods";
import {
  addPackageDependency,
  addPackageScript,
  addEnvVar,
  renderTemplate,
} from "@stanza/codemods";
import type { CodemodContext, Project } from "@stanza/codemods";
import type { Module, ModuleAdapter, StanzaManifest, TemplateRef } from "@stanza/registry";

import { writeManifest } from "./manifest.ts";
import { claim, RegionConflictError } from "./region-tracker.ts";

export type RunResult = {
  manifest: StanzaManifest;
  touchedFiles: string[];
  dryRun: boolean;
};

/**
 * Apply a module's chosen adapter to the project at projectRoot. Handles
 * the declarative parts (templates, env vars, deps, scripts) directly;
 * defers anything in `adapter.codemods` to the codemod registry.
 *
 * This is the only place that writes to disk on `add`. Both the manifest
 * update and the file writes share the same dry-run gate.
 */
export async function applyModule(args: {
  projectRoot: string;
  manifest: StanzaManifest;
  module: Module;
  adapter: ModuleAdapter;
  registryRoot: string;
  dryRun: boolean;
}): Promise<RunResult> {
  const { projectRoot, module, adapter, registryRoot, dryRun } = args;
  let manifest = args.manifest;
  const touchedFiles = new Set<string>();
  const appRoot = path.join(projectRoot, manifest.appDir);

  const owner = module.id;
  const moduleDir = path.join(registryRoot, "modules", `${module.slot}-${module.id}`);

  // 1. Templates (claim regions per-template-file).
  for (const tpl of adapter.templates ?? []) {
    const dest =
      tpl.scope === "repo" ? path.join(projectRoot, tpl.dest) : path.join(appRoot, tpl.dest);
    const rel = path.relative(projectRoot, dest);

    manifest = claim(manifest, rel, "file", owner);
    if (!dryRun) {
      const source = readTemplateSource(tpl, moduleDir);
      const rendered = tpl.template
        ? renderTemplate(source, { appDir: manifest.appDir, projectName: manifest.name })
        : source;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, rendered, "utf8");
    }
    touchedFiles.add(rel);
  }

  // 2. Dependencies on the host package.json (in the active app).
  const appPkg = path.join(appRoot, "package.json");
  if (
    (adapter.dependencies || adapter.devDependencies || adapter.scripts) &&
    fs.existsSync(appPkg)
  ) {
    for (const [name, range] of Object.entries(adapter.dependencies ?? {})) {
      manifest = claim(manifest, path.relative(projectRoot, appPkg), `dependencies.${name}`, owner);
      if (!dryRun) addPackageDependency(appPkg, name, range);
    }
    for (const [name, range] of Object.entries(adapter.devDependencies ?? {})) {
      manifest = claim(
        manifest,
        path.relative(projectRoot, appPkg),
        `devDependencies.${name}`,
        owner,
      );
      if (!dryRun) addPackageDependency(appPkg, name, range, { dev: true });
    }
    for (const [name, command] of Object.entries(adapter.scripts ?? {})) {
      manifest = claim(manifest, path.relative(projectRoot, appPkg), `scripts.${name}`, owner);
      if (!dryRun) addPackageScript(appPkg, name, command);
    }
    touchedFiles.add(path.relative(projectRoot, appPkg));
  }

  // 3. Env vars in .env.example at repo root.
  if (adapter.env && adapter.env.length > 0) {
    const envFile = path.join(projectRoot, ".env.example");
    for (const v of adapter.env) {
      manifest = claim(manifest, ".env.example", v.name, owner);
      if (!dryRun) addEnvVar(envFile, v.name, v.example, v.description);
    }
    touchedFiles.add(".env.example");
  }

  // 4. Imperative codemods — resolved against the module's local codemod registry.
  if (adapter.codemods?.length) {
    const codemods = await loadCodemods(moduleDir);
    const project = lazyProject(appRoot);
    const ctx = buildContext({
      projectRoot,
      appRoot,
      manifest,
      module,
      adapter,
      project,
      touchedFiles,
      dryRun,
      onClaim: (file, region) => {
        manifest = claim(manifest, file, region, owner);
      },
    });
    for (const id of adapter.codemods) {
      const fn = codemods[id];
      if (!fn) {
        throw new Error(`Codemod "${id}" not found in module ${module.id}`);
      }
      const result = await fn.apply(ctx);
      result.touchedFiles.forEach((f) => touchedFiles.add(f));
    }
    if (!dryRun) await project.save?.();
  }

  if (!dryRun) {
    manifest = {
      ...manifest,
      modules: {
        ...manifest.modules,
        [module.slot]: {
          id: module.id,
          version: module.version,
          adapter: adapter.key,
        },
      },
    };
    writeManifest(projectRoot, manifest);
  }

  return { manifest, touchedFiles: [...touchedFiles], dryRun };
}

/**
 * Resolve a template's source text. HTTP-loaded modules inline their template
 * contents in `tpl.content` (the registry build step bakes them in). Local
 * dev (FS-based registry) leaves `content` undefined, so we fall back to
 * reading from the module's templates/ directory on disk.
 */
function readTemplateSource(tpl: TemplateRef, moduleDir: string): string {
  if (tpl.content !== undefined) return tpl.content;
  return fs.readFileSync(path.join(moduleDir, "templates", tpl.src), "utf8");
}

type CodemodMap = Record<string, import("@stanza/codemods").Codemod>;

async function loadCodemods(moduleDir: string): Promise<CodemodMap> {
  const entry = path.join(moduleDir, "codemods", "index.ts");
  if (!fs.existsSync(entry)) return {};
  const mod = (await import(entry)) as { default?: CodemodMap; codemods?: CodemodMap };
  return mod.default ?? mod.codemods ?? {};
}

function lazyProject(appRoot: string): { (): Project; save?: () => Promise<void> } {
  let project: Project | undefined;
  const fn = (() => {
    if (!project) project = openProject(appRoot);
    return project;
  }) as { (): Project; save?: () => Promise<void> };
  fn.save = async () => {
    if (project) await project.save();
  };
  return fn;
}

function buildContext(args: {
  projectRoot: string;
  appRoot: string;
  manifest: StanzaManifest;
  module: Module;
  adapter: ModuleAdapter;
  project: () => Project;
  touchedFiles: Set<string>;
  dryRun: boolean;
  onClaim: (file: string, region: string) => void;
}): CodemodContext {
  return {
    projectRoot: args.projectRoot,
    appRoot: args.appRoot,
    project: args.project,
    manifest: args.manifest,
    owner: { slot: args.module.slot, module: args.module.id },
    adapter: args.adapter.key,
    claimRegion(file, region) {
      args.onClaim(file, region);
    },
    releaseRegion() {
      // No-op during `add`. The remove path uses regionsOwnedBy() to reverse.
    },
  };
}

export { RegionConflictError };
