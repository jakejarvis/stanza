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
import { CODEMOD_CATALOG } from "@stanza/codemods/builtins";
import type {
  JsonValue,
  Module,
  ModuleAdapter,
  SlotId,
  StanzaManifest,
  TemplateRef,
} from "@stanza/registry";
import {
  ADDON_PACKAGE_DIR,
  isAddon,
  mergeInstallFields,
  SLOT_PACKAGE_DIR,
  slotPackageJsonBase,
} from "@stanza/registry";

import { writeManifest } from "./manifest";
import { claim, release, RegionConflictError } from "./region-tracker";

export type RunResult = {
  manifest: StanzaManifest;
  touchedFiles: string[];
  dryRun: boolean;
  /**
   * Non-null when this add caused a new `packages/<dir>/` package to be
   * bootstrapped — used by `add.ts` to print a `pnpm install` hint.
   */
  bootstrappedPackage?: { dir: string; name: string };
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
  // Add-on dirs are named `<category>-<id>` (e.g. `testing-vitest`); slot dirs
  // `<slot>-<id>`. `categoryKey` is also the manifest write key below.
  const categoryKey = isAddon(module) ? module.category : module.slot;
  const moduleDir = path.join(registryRoot, "modules", `${categoryKey}-${module.id}`);

  // Module-level install fields (shared across adapters) are merged with the
  // adapter-level ones (variation per peer combination). Adapter wins per-key
  // on conflicts; env merges by `name`.
  const installFields = mergeInstallFields(module, adapter);

  // Slot/category → package mapping. When non-null, this module's
  // templates/deps/scripts are routed into `packages/<packageDir>/` instead of
  // into the active app. Add-ons are all app/repo-scoped today (null).
  const packageDir = isAddon(module)
    ? ADDON_PACKAGE_DIR[module.category]
    : SLOT_PACKAGE_DIR[module.slot];
  const packageRoot = packageDir ? path.join(projectRoot, "packages", packageDir) : null;
  const packageName = packageDir ? `@${manifest.name}/${packageDir}` : "";

  const needsPackage =
    packageDir !== null &&
    (Boolean(adapter.templates?.some((t) => t.scope === "package")) ||
      Object.keys(installFields.dependencies).length > 0 ||
      Object.keys(installFields.devDependencies).length > 0 ||
      Object.keys(installFields.scripts).length > 0);

  let bootstrappedPackage: { dir: string; name: string } | undefined;
  if (needsPackage && packageDir && packageRoot) {
    const created = ensureSlotPackage({
      projectRoot,
      appRoot,
      manifest,
      packageDir,
      packageName,
      packageRoot,
      consumesPackages: module.consumesPackages ?? [],
      dryRun,
    });
    if (created) bootstrappedPackage = { dir: packageDir, name: packageName };
  }

  const renderContext = buildRenderContext(manifest, packageName);

  // 1. Templates (claim regions per-template-file).
  for (const tpl of adapter.templates ?? []) {
    const dest = resolveTemplateDest({ tpl, projectRoot, appRoot, packageRoot, slot: categoryKey });
    const rel = path.relative(projectRoot, dest);

    manifest = claim(manifest, rel, "file", owner);
    if (!dryRun) {
      const source = readTemplateSource(tpl, moduleDir);
      const rendered = tpl.template ? renderTemplate(source, renderContext) : source;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, rendered, "utf8");
    }
    touchedFiles.add(rel);
  }

  // 2. Dependencies + scripts on package.json. Routes to the slot's package
  //    when `SLOT_PACKAGE_DIR[slot]` is non-null; otherwise the active app.
  // The slot-package path is bootstrapped above by `ensureSlotPackage`; the
  // app path is created by `stanza init` (bootstrapShell). For `stanza add`
  // in a pre-existing project, missing app package.json is a real misuse.
  const pkgJsonPath = packageRoot
    ? path.join(packageRoot, "package.json")
    : path.join(appRoot, "package.json");
  const hasInstall =
    Object.keys(installFields.dependencies).length > 0 ||
    Object.keys(installFields.devDependencies).length > 0 ||
    Object.keys(installFields.scripts).length > 0;
  if (hasInstall && !fs.existsSync(pkgJsonPath)) {
    throw new Error(
      `Cannot apply ${module.id}: ${path.relative(projectRoot, pkgJsonPath)} doesn't exist. ` +
        `For \`stanza add\` in an existing project, create it manually first.`,
    );
  }
  if (hasInstall) {
    for (const [name, range] of Object.entries(installFields.dependencies)) {
      manifest = claim(
        manifest,
        path.relative(projectRoot, pkgJsonPath),
        `dependencies.${name}`,
        owner,
      );
      if (!dryRun) addPackageDependency(pkgJsonPath, name, range);
    }
    for (const [name, range] of Object.entries(installFields.devDependencies)) {
      manifest = claim(
        manifest,
        path.relative(projectRoot, pkgJsonPath),
        `devDependencies.${name}`,
        owner,
      );
      if (!dryRun) addPackageDependency(pkgJsonPath, name, range, { dev: true });
    }
    for (const [name, command] of Object.entries(installFields.scripts)) {
      manifest = claim(manifest, path.relative(projectRoot, pkgJsonPath), `scripts.${name}`, owner);
      if (!dryRun) addPackageScript(pkgJsonPath, name, command);
    }
    touchedFiles.add(path.relative(projectRoot, pkgJsonPath));
  }

  // 3. Env vars in .env.example at repo root.
  if (installFields.env.length > 0) {
    const envFile = path.join(projectRoot, ".env.example");
    for (const v of installFields.env) {
      manifest = claim(manifest, ".env.example", v.name, owner);
      if (!dryRun) addEnvVar(envFile, v.name, v.example, v.description);
    }
    touchedFiles.add(".env.example");
  }

  // 4. Imperative codemods — dispatched through the CLI's generic catalog.
  // Modules don't ship code; they reference catalog entries by id and pass
  // the per-invocation args from their manifest. Args are rendered through
  // the same template substitution as file bodies so modules can declare
  // e.g. `providerImport: "{{packageName}}"`.
  if (adapter.codemods?.length) {
    const project = lazyProject(appRoot);
    const ctx = buildContext({
      projectRoot,
      appRoot,
      manifest,
      module,
      adapter,
      project: project.get,
      touchedFiles,
      dryRun,
      onClaim: (file, region) => {
        manifest = claim(manifest, file, region, owner);
      },
    });
    for (const invocation of adapter.codemods) {
      const fn = CODEMOD_CATALOG[invocation.id];
      if (!fn) {
        throw new Error(
          `Codemod "${invocation.id}" referenced by ${categoryKey}/${module.id} (adapter "${adapter.key}") is not in the catalog. Add it to packages/codemods/src/builtins/ and register in builtins/index.ts.`,
        );
      }
      if (!dryRun) {
        const renderedArgs = renderArgs(invocation.args ?? {}, renderContext);
        const result = await fn.apply(ctx, renderedArgs);
        result.touchedFiles.forEach((f) => touchedFiles.add(f));
      }
    }
    if (!dryRun) await project.save();
  }

  if (!dryRun) {
    const record = { id: module.id, version: module.version, adapter: adapter.key };
    if (isAddon(module)) {
      // Push into the category array, replacing any same-id record so re-adds
      // are idempotent. Other add-ons in the category are preserved.
      const existing = manifest.addons[module.category] ?? [];
      manifest = {
        ...manifest,
        addons: {
          ...manifest.addons,
          [module.category]: [...existing.filter((r) => r.id !== module.id), record],
        },
      };
    } else {
      manifest = {
        ...manifest,
        modules: { ...manifest.modules, [module.slot]: record },
      };
    }
    writeManifest(projectRoot, manifest);
  }

  return { manifest, touchedFiles: [...touchedFiles], dryRun, bootstrappedPackage };
}

function resolveTemplateDest(args: {
  tpl: TemplateRef;
  projectRoot: string;
  appRoot: string;
  packageRoot: string | null;
  slot: SlotId | string;
}): string {
  const { tpl, projectRoot, appRoot, packageRoot, slot } = args;
  if (tpl.scope === "repo") return path.join(projectRoot, tpl.dest);
  if (tpl.scope === "package") {
    if (!packageRoot) {
      throw new Error(
        `Template scope "package" is not valid for slot "${slot}" — SLOT_PACKAGE_DIR has no entry for it. ` +
          `Use scope "app" for framework/styling modules.`,
      );
    }
    return path.join(packageRoot, tpl.dest);
  }
  return path.join(appRoot, tpl.dest);
}

/**
 * Create the slot's workspace package on first need. Idempotent: if the
 * package.json/tsconfig.json/workspace dep already exist, this is a no-op.
 * Returns true when at least one file was newly created (the signal `add.ts`
 * uses to print a `pnpm install` hint).
 *
 * These files are NOT claimed as regions: they are shared by every module
 * that lives in the package (e.g. db + orm both write into packages/db/).
 * The remove path's package-dir sweep deletes them only after every module
 * has released its claims under packages/<dir>/.
 */
function ensureSlotPackage(args: {
  projectRoot: string;
  appRoot: string;
  manifest: StanzaManifest;
  packageDir: string;
  packageName: string;
  packageRoot: string;
  consumesPackages: string[];
  dryRun: boolean;
}): boolean {
  const { appRoot, packageDir, packageName, packageRoot, consumesPackages, dryRun } = args;
  const pkgPath = path.join(packageRoot, "package.json");
  const tsconfigPath = path.join(packageRoot, "tsconfig.json");
  const appPkgPath = path.join(appRoot, "package.json");

  let created = false;

  if (!fs.existsSync(pkgPath)) {
    created = true;
    if (!dryRun) {
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        pkgPath,
        JSON.stringify(slotPackageJsonBase({ name: args.manifest.name, dir: packageDir }), null, 2) +
          "\n",
        "utf8",
      );
    }
  }

  if (!fs.existsSync(tsconfigPath)) {
    created = true;
    if (!dryRun) {
      // Self-contained tsconfig — generated projects don't share a base, so
      // each app and package stands on its own. Mirrors the shape framework
      // modules ship for `apps/web/tsconfig.json`.
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              lib: ["dom", "dom.iterable", "esnext"],
              module: "esnext",
              moduleResolution: "bundler",
              strict: true,
              noUncheckedIndexedAccess: true,
              skipLibCheck: true,
              esModuleInterop: true,
              resolveJsonModule: true,
              isolatedModules: true,
              noEmit: true,
              types: ["node"],
            },
            include: ["src"],
            exclude: ["node_modules"],
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
    }
  }

  // Wire the workspace dep into the host app's package.json on first
  // bootstrap. Not region-tracked — sweep cleans it up.
  if (fs.existsSync(appPkgPath)) {
    const appPkg = JSON.parse(fs.readFileSync(appPkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    if (appPkg.dependencies?.[packageName] !== "workspace:*") {
      created = true;
      if (!dryRun) addPackageDependency(appPkgPath, packageName, "workspace:*");
    }
  }

  // Wire cross-package workspace deps so this package can import from its
  // peers (e.g. better-auth's auth.ts importing `db` from `@<project>/db`).
  // Skip self-references and unknown package dirs.
  if (consumesPackages.length > 0) {
    const allowed = new Set(Object.values(SLOT_PACKAGE_DIR).filter((d): d is string => d !== null));
    const ownPkgJson = path.join(packageRoot, "package.json");
    for (const peer of consumesPackages) {
      if (peer === packageDir) continue;
      if (!allowed.has(peer)) continue;
      const peerName = `@${args.manifest.name}/${peer}`;
      if (!fs.existsSync(ownPkgJson)) continue;
      const pkg = JSON.parse(fs.readFileSync(ownPkgJson, "utf8")) as {
        dependencies?: Record<string, string>;
      };
      if (pkg.dependencies?.[peerName] !== "workspace:*") {
        created = true;
        if (!dryRun) addPackageDependency(ownPkgJson, peerName, "workspace:*");
      }
    }
  }

  return created;
}

/**
 * Walk a codemod args object and run renderTemplate over every string leaf.
 * Non-string values pass through untouched. The contract for catalog
 * codemods is that string args may contain `{{projectName}}`, `{{appDir}}`,
 * `{{packageName}}` — anything else should be passed in raw.
 */
function renderArgs(
  args: Record<string, JsonValue>,
  context: Record<string, string>,
): Record<string, JsonValue> {
  const visit = (value: JsonValue): JsonValue => {
    if (typeof value === "string") return renderTemplate(value, context);
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      const out: Record<string, JsonValue> = {};
      for (const [k, v] of Object.entries(value)) out[k] = visit(v);
      return out;
    }
    return value;
  };
  return visit(args) as Record<string, JsonValue>;
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

/**
 * Defer opening a ts-morph project until a codemod actually asks for it —
 * adapters that only ship templates/deps don't pay the cost. `save()` is a
 * no-op if no codemod ever called `get()`.
 */
function lazyProject(appRoot: string): { get: () => Project; save: () => Promise<void> } {
  let project: Project | undefined;
  return {
    get() {
      if (!project) project = openProject(appRoot);
      return project;
    },
    async save() {
      if (project) await project.save();
    },
  };
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
  onClaim?: (file: string, region: string) => void;
  onRelease?: (file: string, region: string) => void;
}): CodemodContext {
  return {
    projectRoot: args.projectRoot,
    appRoot: args.appRoot,
    project: args.project,
    manifest: args.manifest,
    owner: isAddon(args.module)
      ? { category: args.module.category, module: args.module.id }
      : { slot: args.module.slot, module: args.module.id },
    adapter: args.adapter.key,
    claimRegion(file, region) {
      args.onClaim?.(file, region);
    },
    releaseRegion(file, region) {
      args.onRelease?.(file, region);
    },
  };
}

/**
 * Build the render context used by both template-body substitution and
 * codemod-args substitution. Provides:
 *  - `{{appDir}}`, `{{projectName}}` — project-level
 *  - `{{packageName}}` — the active module's own package (empty for slots
 *    without a package mapping)
 *  - `{{<dir>PackageName}}` (e.g. `{{dbPackageName}}`) — shorthand for every
 *    slot package, so cross-package imports stay declarative
 */
function buildRenderContext(manifest: StanzaManifest, packageName: string): Record<string, string> {
  const ctx: Record<string, string> = {
    appDir: manifest.appDir,
    projectName: manifest.name,
    packageName,
  };
  for (const dir of new Set(
    Object.values(SLOT_PACKAGE_DIR).filter((d): d is string => d !== null),
  )) {
    ctx[`${dir}PackageName`] = `@${manifest.name}/${dir}`;
  }
  return ctx;
}

export type RevertResult = {
  manifest: StanzaManifest;
  touchedFiles: string[];
  dryRun: boolean;
  /**
   * Codemods that couldn't be reverted automatically — either no `revert()`
   * is defined or one threw. Each entry is the codemod id; the caller
   * surfaces this as "needs manual cleanup".
   */
  manualCleanup: string[];
};

/**
 * Replay an installed module's imperative codemods in reverse via their
 * `revert()` functions. Each revert releases the regions it claimed, which
 * we propagate into the manifest. Declarative reversals (files, deps, env)
 * stay in `commands/remove.ts` — they're region-driven and don't need the
 * module to be re-loaded.
 *
 * Args are reconstructed by running the original `args` template strings
 * through the same `renderTemplate` substitution used on apply, so reverts
 * see the same concrete values (e.g. `providerImport: "@my-app/auth"`).
 */
export async function revertCodemods(args: {
  projectRoot: string;
  manifest: StanzaManifest;
  module: Module;
  adapter: ModuleAdapter;
  dryRun: boolean;
}): Promise<RevertResult> {
  const { projectRoot, module, adapter, dryRun } = args;
  let manifest = args.manifest;
  const touchedFiles = new Set<string>();
  const manualCleanup: string[] = [];
  const appRoot = path.join(projectRoot, manifest.appDir);

  const codemods = adapter.codemods ?? [];
  if (codemods.length === 0) return { manifest, touchedFiles: [], dryRun, manualCleanup };

  const packageDir = isAddon(module)
    ? ADDON_PACKAGE_DIR[module.category]
    : SLOT_PACKAGE_DIR[module.slot];
  const packageName = packageDir ? `@${manifest.name}/${packageDir}` : "";
  const renderContext = buildRenderContext(manifest, packageName);

  const project = lazyProject(appRoot);
  const ctx = buildContext({
    projectRoot,
    appRoot,
    manifest,
    module,
    adapter,
    project: project.get,
    touchedFiles,
    dryRun,
    onRelease: (file, region) => {
      manifest = release(manifest, file, region);
    },
  });

  // Reverse order: if codemod B layered on top of A's output, undo B first.
  for (const invocation of codemods.toReversed()) {
    const fn = CODEMOD_CATALOG[invocation.id];
    if (!fn || !fn.revert) {
      manualCleanup.push(invocation.id);
      continue;
    }
    if (dryRun) continue;
    try {
      const renderedArgs = renderArgs(invocation.args ?? {}, renderContext);
      const result = await fn.revert(ctx, renderedArgs);
      result.touchedFiles.forEach((f) => touchedFiles.add(f));
    } catch {
      // Don't surface the exception body — the caller already prints a
      // "manual cleanup" warning with the codemod id; the user can re-run
      // with stack traces if they need details. Keep going so other codemods
      // still get a chance to revert.
      manualCleanup.push(invocation.id);
    }
  }
  if (!dryRun) await project.save();

  return { manifest, touchedFiles: [...touchedFiles], dryRun, manualCleanup };
}

export { RegionConflictError };
