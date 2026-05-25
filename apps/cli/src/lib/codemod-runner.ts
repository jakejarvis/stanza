import fs from "node:fs";
import path from "node:path";

import { openProject } from "@stanza/codemods";
import { addPackageDependency, addPackageScript, addEnvVar } from "@stanza/codemods";
import type { CodemodContext, Project } from "@stanza/codemods";
import { CODEMOD_CATALOG } from "@stanza/codemods/builtins";
import type {
  AppSpec,
  JsonValue,
  Module,
  ModuleAdapter,
  StanzaManifest,
  TemplateContext,
  TemplateRef,
} from "@stanza/registry";
import {
  activePeerIds,
  buildRenderContext,
  categoryHome,
  installPackageJsonTargets,
  mergeInstallFields,
  PACKAGE_DIRS,
  renderTemplate,
  slotPackageJsonBase,
} from "@stanza/registry";

import { writeManifest } from "./manifest";
import { resolveRanges } from "./npm-version";
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
 *
 * `targetApps` semantics depend on the module's category `home`:
 *   - `home: "app"`     — exactly one app; templates/deps land there.
 *   - `home: "package"` — one or more *consuming* apps; the package is written
 *                          once and app-scoped shims loop per app.
 *   - `home: "repo"`    — ignored; repo-home modules are project-wide. Pass
 *                          any single app (e.g. the project's first) for
 *                          render-context seeding.
 */
export async function applyModule(args: {
  projectRoot: string;
  manifest: StanzaManifest;
  module: Module;
  adapter: ModuleAdapter;
  targetApps: AppSpec[];
  registryRoot: string;
  dryRun: boolean;
}): Promise<RunResult> {
  const { projectRoot, module, adapter, targetApps, registryRoot, dryRun } = args;
  let manifest = args.manifest;
  const touchedFiles = new Set<string>();

  const home = categoryHome(module.category);
  if (home.kind === "app" && targetApps.length !== 1) {
    throw new Error(
      `applyModule: home:"app" modules require exactly one targetApp, got ${targetApps.length}.`,
    );
  }
  if (targetApps.length === 0) {
    throw new Error(
      `applyModule: targetApps must be non-empty (repo-home modules still need a seed app).`,
    );
  }

  const owner = module.id;
  // Module dirs are named `<category>-<id>` (e.g. `testing-vitest`).
  const moduleDir = path.join(registryRoot, "modules", `${module.category}-${module.id}`);

  // Module-level install fields (shared across adapters) are merged with the
  // adapter-level ones (variation per peer combination). Adapter wins per-key
  // on conflicts; env merges by `name`.
  const installFields = mergeInstallFields(module, adapter);

  // `categoryHome` (in @stanza/registry) is the single decision point for where
  // a module's templates/deps/scripts land — package (`packages/<dir>/`), repo
  // root, or each targeted app.
  const packageDir = home.kind === "package" ? home.dir : null;
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
      consumingApps: targetApps,
      manifest,
      packageDir,
      packageName,
      packageRoot,
      consumesPackages: module.consumesPackages ?? [],
      dryRun,
    });
    if (created) bootstrappedPackage = { dir: packageDir, name: packageName };
  }

  // Pre-build a render context per targeted app. Each context binds `app.*` to
  // the active target so a module shipped into multiple apps renders correctly
  // per app. `seedApp` covers repo/package-scoped templates — they don't
  // reference `app.*` but `buildRenderContext` still needs a valid `AppSpec`.
  // Peers are resolved per-app so app-scoped templates see the right framework
  // (e.g. web's framework vs native's) when conditionally branching.
  const renderContextFor = (app: AppSpec): TemplateContext =>
    buildRenderContext({
      projectName: manifest.name,
      app,
      packageName,
      peers: activePeerIds(manifest, app.id),
    });
  const seedApp = targetApps[0]!;

  // 1. Templates (claim regions per-template-file). App-scoped templates loop
  //    over `targetApps`; package/repo-scoped templates emit once.
  for (const tpl of adapter.templates ?? []) {
    if (tpl.scope === "app") {
      for (const app of targetApps) {
        const dest = path.join(projectRoot, app.dir, tpl.dest);
        const rel = path.relative(projectRoot, dest);
        manifest = claim(manifest, rel, "file", owner);
        if (!dryRun) {
          const source = readTemplateSource(tpl, moduleDir);
          const rendered = tpl.template ? renderTemplate(source, renderContextFor(app)) : source;
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, rendered, "utf8");
        }
        touchedFiles.add(rel);
      }
      continue;
    }
    // package / repo scope — single emit.
    const dest = resolveNonAppTemplateDest({
      tpl,
      projectRoot,
      packageRoot,
      category: module.category,
    });
    const rel = path.relative(projectRoot, dest);
    manifest = claim(manifest, rel, "file", owner);
    if (!dryRun) {
      const source = readTemplateSource(tpl, moduleDir);
      const rendered = tpl.template ? renderTemplate(source, renderContextFor(seedApp)) : source;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, rendered, "utf8");
    }
    touchedFiles.add(rel);
  }

  // 2. Dependencies + scripts on package.json. For app-home, route into each
  //    targeted app's package.json; for package-home, into `packages/<dir>/`;
  //    for repo-home, into the root package.json. The relevant package.json
  //    must already exist (init's bootstrapShell creates root + per-app;
  //    ensureSlotPackage handles the slot's).
  const hasInstall =
    Object.keys(installFields.dependencies).length > 0 ||
    Object.keys(installFields.devDependencies).length > 0 ||
    Object.keys(installFields.scripts).length > 0;
  if (hasInstall) {
    const installTargets = installPackageJsonTargets(module, targetApps);
    for (const target of installTargets) {
      const pkgJsonPath = path.join(projectRoot, target);
      if (!fs.existsSync(pkgJsonPath)) {
        throw new Error(
          `Cannot apply ${module.id}: ${target} doesn't exist. ` +
            `For \`stanza add\` in an existing project, create it manually first.`,
        );
      }
    }
    // Re-pin declared `^`/`~` ranges to the latest published version that still
    // satisfies them (e.g. `^1.6.11` → `^1.8.3`), preserving the modifier. Skip
    // the network on dry-run since nothing is written. `resolveRanges` falls
    // back to the verbatim range on any lookup failure.
    const deps = dryRun
      ? installFields.dependencies
      : await resolveRanges(installFields.dependencies);
    const devDeps = dryRun
      ? installFields.devDependencies
      : await resolveRanges(installFields.devDependencies);

    for (const target of installTargets) {
      const pkgJsonPath = path.join(projectRoot, target);
      for (const [name, range] of Object.entries(deps)) {
        manifest = claim(manifest, target, `dependencies.${name}`, owner);
        if (!dryRun) addPackageDependency(pkgJsonPath, name, range);
      }
      for (const [name, range] of Object.entries(devDeps)) {
        manifest = claim(manifest, target, `devDependencies.${name}`, owner);
        if (!dryRun) addPackageDependency(pkgJsonPath, name, range, { dev: true });
      }
      for (const [name, command] of Object.entries(installFields.scripts)) {
        manifest = claim(manifest, target, `scripts.${name}`, owner);
        if (!dryRun) addPackageScript(pkgJsonPath, name, command);
      }
      touchedFiles.add(target);
    }
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
  //    For app-home and package-home modules, run once per targeted app so
  //    codemods that edit files inside an app dir see the right app context.
  //    For repo-home modules, run once with the seed app.
  if (adapter.codemods?.length) {
    const dispatchApps = home.kind === "repo" ? [seedApp] : targetApps;
    for (const app of dispatchApps) {
      const appRoot = path.join(projectRoot, app.dir);
      const project = lazyProject(appRoot);
      const ctx = buildContext({
        projectRoot,
        app,
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
            `Codemod "${invocation.id}" referenced by ${module.category}/${module.id} (adapter "${adapter.key}") is not in the catalog. Add it to packages/codemods/src/builtins/ and register in builtins/index.ts.`,
          );
        }
        if (!dryRun) {
          const renderedArgs = renderArgs(invocation.args ?? {}, renderContextFor(app));
          const result = await fn.apply(ctx, renderedArgs);
          result.touchedFiles.forEach((f) => touchedFiles.add(f));
        }
      }
      if (!dryRun) await project.save();
    }
  }

  if (!dryRun) {
    const record = recordFor(module, adapter, targetApps);
    // Push into the category's array, replacing any same-(id, apps-key) record
    // so re-adds are idempotent. Single-choice categories with home:"app" are
    // kept to one record per app id by `add`/`init` validation; other homes
    // stay capped at ≤ 1 total.
    const existing = manifest.modules[module.category] ?? [];
    const sameKey = (r: typeof record) => r.id === record.id && sameAppSet(r.apps, record.apps);
    manifest = {
      ...manifest,
      modules: {
        ...manifest.modules,
        [module.category]: [...existing.filter((r) => !sameKey(r)), record],
      },
    };
    writeManifest(projectRoot, manifest);
  }

  return { manifest, touchedFiles: [...touchedFiles], dryRun, bootstrappedPackage };
}

function recordFor(
  module: Module,
  adapter: ModuleAdapter,
  targetApps: AppSpec[],
): { id: string; version: string; adapter: string; apps?: string[] } {
  const home = categoryHome(module.category);
  const base = { id: module.id, version: module.version, adapter: adapter.key };
  if (home.kind === "repo") return base;
  // Both app-home and package-home tag with the consuming apps so `remove`
  // can find them and so the schema stays well-formed.
  return { ...base, apps: targetApps.map((a) => a.id) };
}

function sameAppSet(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

function resolveNonAppTemplateDest(args: {
  tpl: TemplateRef;
  projectRoot: string;
  packageRoot: string | null;
  category: string;
}): string {
  const { tpl, projectRoot, packageRoot, category } = args;
  if (tpl.scope === "repo") return path.join(projectRoot, tpl.dest);
  if (tpl.scope === "package") {
    if (!packageRoot) {
      throw new Error(
        `Template scope "package" is not valid for category "${category}" — its home isn't a package. ` +
          `Use scope "app" or "repo" for app/repo-scoped categories.`,
      );
    }
    return path.join(packageRoot, tpl.dest);
  }
  // scope === "app" — caller's responsibility; this helper handles only
  // package/repo.
  throw new Error(`resolveNonAppTemplateDest: app-scope template should be handled separately.`);
}

/**
 * Create the slot's workspace package on first need and wire the workspace dep
 * into every *consuming* app's package.json. Idempotent: re-applying the same
 * module against the same apps is a no-op. Returns true when at least one file
 * was newly created (the signal `add.ts` uses to print a `pnpm install` hint).
 *
 * The package's own `package.json` and `tsconfig.json` are NOT claimed as
 * regions: they're shared by every module that lives in the package (e.g. db
 * + orm both write into packages/db/). The remove path's package-dir sweep
 * deletes them only after every module has released its claims under
 * `packages/<dir>/`.
 */
function ensureSlotPackage(args: {
  projectRoot: string;
  consumingApps: AppSpec[];
  manifest: StanzaManifest;
  packageDir: string;
  packageName: string;
  packageRoot: string;
  consumesPackages: string[];
  dryRun: boolean;
}): boolean {
  const {
    projectRoot,
    consumingApps,
    packageDir,
    packageName,
    packageRoot,
    consumesPackages,
    dryRun,
  } = args;
  const pkgPath = path.join(packageRoot, "package.json");
  const tsconfigPath = path.join(packageRoot, "tsconfig.json");

  let created = false;

  if (!fs.existsSync(pkgPath)) {
    created = true;
    if (!dryRun) {
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        pkgPath,
        JSON.stringify(
          slotPackageJsonBase({ name: args.manifest.name, dir: packageDir }),
          null,
          2,
        ) + "\n",
        "utf8",
      );
    }
  }

  if (!fs.existsSync(tsconfigPath)) {
    created = true;
    if (!dryRun) {
      // Self-contained tsconfig — generated projects don't share a base, so
      // each app and package stands on its own. Mirrors the shape framework
      // modules ship for app `tsconfig.json`.
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

  // Wire the workspace dep into *every consuming* app's package.json. Not
  // region-tracked — the sweep cleans it up.
  for (const app of consumingApps) {
    const appPkgPath = path.join(projectRoot, app.dir, "package.json");
    if (!fs.existsSync(appPkgPath)) continue;
    const appPkg: { dependencies?: Record<string, string> } = JSON.parse(
      fs.readFileSync(appPkgPath, "utf8"),
    );
    if (appPkg.dependencies?.[packageName] !== "workspace:*") {
      created = true;
      if (!dryRun) addPackageDependency(appPkgPath, packageName, "workspace:*");
    }
  }

  // Wire cross-package workspace deps so this package can import from its
  // peers (e.g. better-auth's auth.ts importing `db` from `@<project>/db`).
  // Skip self-references and unknown package dirs.
  if (consumesPackages.length > 0) {
    const ownPkgJson = path.join(packageRoot, "package.json");
    for (const peer of consumesPackages) {
      if (peer === packageDir) continue;
      if (!PACKAGE_DIRS.has(peer)) continue;
      const peerName = `@${args.manifest.name}/${peer}`;
      if (!fs.existsSync(ownPkgJson)) continue;
      const pkg: { dependencies?: Record<string, string> } = JSON.parse(
        fs.readFileSync(ownPkgJson, "utf8"),
      );
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
 * codemods is that string args may contain `{{project.name}}`, `{{app.dir}}`,
 * `{{app.id}}`, `{{app.kind}}`, `{{package.name}}`, `{{packages.<dir>.name}}`
 * — anything else should be passed in raw.
 */
function renderArgs(
  args: Record<string, JsonValue>,
  context: TemplateContext,
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
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(args)) out[k] = visit(v);
  return out;
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
  app: AppSpec;
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
    app: args.app,
    appRoot: args.appRoot,
    project: args.project,
    manifest: args.manifest,
    owner: { category: args.module.category, module: args.module.id },
    adapter: args.adapter.key,
    claimRegion(file, region) {
      args.onClaim?.(file, region);
    },
    releaseRegion(file, region) {
      args.onRelease?.(file, region);
    },
  };
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
 *
 * Loops over the same `targetApps` the apply path used so each codemod's
 * revert sees the right app context.
 */
export async function revertCodemods(args: {
  projectRoot: string;
  manifest: StanzaManifest;
  module: Module;
  adapter: ModuleAdapter;
  targetApps: AppSpec[];
  dryRun: boolean;
}): Promise<RevertResult> {
  const { projectRoot, module, adapter, targetApps, dryRun } = args;
  let manifest = args.manifest;
  const touchedFiles = new Set<string>();
  const manualCleanup: string[] = [];

  const codemods = adapter.codemods ?? [];
  if (codemods.length === 0) return { manifest, touchedFiles: [], dryRun, manualCleanup };
  if (targetApps.length === 0) {
    return { manifest, touchedFiles: [], dryRun, manualCleanup };
  }

  const home = categoryHome(module.category);
  const packageName = home.kind === "package" ? `@${manifest.name}/${home.dir}` : "";
  const dispatchApps = home.kind === "repo" ? [targetApps[0]!] : targetApps;

  for (const app of dispatchApps) {
    const appRoot = path.join(projectRoot, app.dir);
    const renderContext = buildRenderContext({
      projectName: manifest.name,
      app,
      packageName,
      peers: activePeerIds(manifest, app.id),
    });
    const project = lazyProject(appRoot);
    const ctx = buildContext({
      projectRoot,
      app,
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
  }

  return { manifest, touchedFiles: [...touchedFiles], dryRun, manualCleanup };
}

export { RegionConflictError };
