import fs from "node:fs";
import path from "node:path";

import { openProject } from "@withstanza/codemods";
import { addPackageDependency, addPackageScript, addEnvVar } from "@withstanza/codemods";
import type { CodemodContext, Project } from "@withstanza/codemods";
import { CODEMOD_CATALOG } from "@withstanza/codemods/builtins";
import type { TemplateContext } from "@withstanza/registry";
import {
  activePeerIds,
  buildRenderContext,
  installPackageJsonTargets,
  mergeInstallFields,
  renderTemplate,
  slotPackageJsonBase,
} from "@withstanza/registry";
import type {
  AppSpec,
  CategoryId,
  JsonValue,
  Module,
  ModuleAdapter,
  StanzaManifest,
  TemplateRef,
} from "@withstanza/schema";
import { categoryHome, declaredEnvNames, PACKAGE_DIRS } from "@withstanza/schema";
import { assertSafeRelativePath } from "@withstanza/utils";
import semver from "semver";

import { FileTx } from "./file-tx";
import { manifestPath, writeManifest } from "./manifest";
import { resolveRanges } from "./npm-version";
import { claim, release, RegionConflictError } from "./region-tracker";

/**
 * A single entry in the human-facing preview of what an apply would do. Built
 * during the same walk that stages the real writes, so the preview can't drift
 * from what apply actually does. Surfaced by `add` on `--dry-run` and as the
 * post-apply summary.
 */
export type PlanAction = {
  op: "create" | "modify" | "skip";
  /** Repo-relative, forward-slashed (matches region keys). */
  path: string;
  /** Human label, e.g. "template", "dependency @clerk/nextjs", "codemod wrap-root-layout". */
  detail: string;
  /** Present for op:"skip" (e.g. "newer version already pinned"). */
  reason?: string;
};

export type RunResult = {
  manifest: StanzaManifest;
  touchedFiles: string[];
  dryRun: boolean;
  /** Ordered preview of file actions this apply would take (templates, deps, env, codemods). */
  plan: PlanAction[];
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
  /**
   * Namespace the module was loaded from (e.g. `"@acme"`). Persisted on the
   * `StanzaModuleRecord` so `remove`/`update` can refetch from the original
   * registry. `undefined` (default) means the first-party `@stanza` registry.
   */
  namespace?: string;
  dryRun: boolean;
}): Promise<RunResult> {
  const { projectRoot, module, adapter, targetApps, namespace, dryRun } = args;
  let manifest = args.manifest;
  const touchedFiles = new Set<string>();

  // Validate catalog ids before any disk writes — third-party modules may
  // reference first-party codemod ids but can't ship new ones, and we don't
  // want `ensureSlotPackage` (below) to bootstrap a slot package only to
  // throw mid-flight and leave it orphaned. Runs on dry-run too, so users
  // catch typos without --apply.
  for (const invocation of adapter.codemods ?? []) {
    if (!CODEMOD_CATALOG[invocation.id]) {
      throw new Error(
        `Codemod "${invocation.id}" referenced by ${module.category}/${module.id} (adapter "${adapter.key}") is not in the catalog. Add it to packages/codemods/src/builtins/ and register in builtins/index.ts.`,
      );
    }
  }

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

  // `home: app` records can coexist across apps for multi-cardinality
  // categories (e.g. testing). Composite owner disambiguates so a remove on
  // one app doesn't sweep another app's claims. Non-app homes stay on bare
  // module id (their regions are project-wide).
  const owner =
    home.kind === "app" && targetApps.length === 1
      ? `${module.id}@${targetApps[0]!.id}`
      : module.id;
  // Module-level install fields (shared across adapters) are merged with the
  // adapter-level ones (variation per peer combination). Adapter wins per-key
  // on conflicts; env merges by `name`.
  const installFields = mergeInstallFields(module, adapter);

  // `categoryHome` (in @withstanza/schema) is the single decision point for where
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
  // Slot-package bootstrap writes get deferred alongside everything else so a
  // mid-flush throw leaves no on-disk state the manifest can't sweep.
  const slotBootstrapWrites: Array<() => void> = [];
  if (needsPackage && packageDir && packageRoot) {
    const { created, writes } = planSlotPackageBootstrap({
      projectRoot,
      consumingApps: targetApps,
      manifest,
      packageDir,
      packageName,
      packageRoot,
      consumesPackages: module.consumesPackages ?? [],
    });
    if (created) bootstrappedPackage = { dir: packageDir, name: packageName };
    if (!dryRun) slotBootstrapWrites.push(...writes);
  }

  // Pre-build a render context per targeted app. Each context binds `app.*` to
  // the active target so a module shipped into multiple apps renders correctly
  // per app. `seedApp` covers repo/package-scoped templates — they don't
  // reference `app.*` but `buildRenderContext` still needs a valid `AppSpec`.
  // Peers are resolved per-app so app-scoped templates see the right framework
  // (e.g. web's framework vs native's) when conditionally branching.
  // Templates render against the manifest *as of now* — peers already applied
  // and env vars already claimed in `.env.example`. Repo-home modules that
  // run late (e.g. `monorepo-turbo`) get the full set of env names emitted
  // by every prior module, which is exactly what `globalEnv` needs.
  const renderContextFor = (app: AppSpec): TemplateContext =>
    buildRenderContext({
      projectName: manifest.name,
      app,
      packageName,
      peers: activePeerIds(manifest, app.id),
      envNames: declaredEnvNames(manifest),
      consumesPackages: module.consumesPackages,
    });
  const seedApp = targetApps[0]!;

  // Manifest writes lead disk writes: claims are staged in-memory, persisted,
  // then flushed. A mid-flush crash leaves orphan files the manifest already
  // knows how to sweep — the old single-pass ordering didn't.
  const deferredWrites: Array<() => void> = [];

  // Human-facing preview, accumulated alongside the staged writes so it can't
  // drift from what apply does. `create` vs `modify` is decided by
  // `fs.existsSync` at walk time — accurate in both modes since writes are
  // deferred (nothing on disk has changed yet when we look).
  const plan: PlanAction[] = [];

  // 1. Templates (claim regions per-template-file). App-scoped templates loop
  //    over `targetApps`; package/repo-scoped templates emit once.
  for (const tpl of adapter.templates ?? []) {
    // Defense in depth — Zod rejects bad dest at parse; this catches anything
    // that bypassed parse (in-memory mutation, stale manifest).
    assertSafeRelativePath(tpl.dest, `${module.id} template dest`);
    if (tpl.scope === "app") {
      for (const app of targetApps) {
        const dest = path.join(projectRoot, app.dir, tpl.dest);
        // Forward-slash so the manifest stays portable across Windows + Unix.
        const rel = path.relative(projectRoot, dest).replaceAll(path.sep, "/");
        manifest = claim(manifest, rel, "file", owner);
        plan.push(templateAction(rel, dest));
        if (!dryRun) {
          const source = readTemplateSource(tpl);
          const rendered = tpl.template ? renderTemplate(source, renderContextFor(app)) : source;
          deferredWrites.push(() => {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, rendered, "utf8");
          });
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
    const rel = path.relative(projectRoot, dest).replaceAll(path.sep, "/");
    manifest = claim(manifest, rel, "file", owner);
    plan.push(templateAction(rel, dest));
    if (!dryRun) {
      const source = readTemplateSource(tpl);
      const rendered = tpl.template ? renderTemplate(source, renderContextFor(seedApp)) : source;
      deferredWrites.push(() => {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, rendered, "utf8");
      });
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
    // The slot's package.json may be deferred-bootstrapped by planSlotPackageBootstrap;
    // that's fine — the file will exist by the time deferredWrites flush.
    const slotBootstrapTarget = packageDir !== null ? `packages/${packageDir}/package.json` : null;
    for (const target of installTargets) {
      if (target === slotBootstrapTarget) continue;
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
        plan.push(depAction(target, pkgJsonPath, name, range, false));
        if (!dryRun)
          deferredWrites.push(() => writeDepKeepingHigher(pkgJsonPath, name, range, false));
      }
      for (const [name, range] of Object.entries(devDeps)) {
        manifest = claim(manifest, target, `devDependencies.${name}`, owner);
        plan.push(depAction(target, pkgJsonPath, name, range, true));
        if (!dryRun)
          deferredWrites.push(() => writeDepKeepingHigher(pkgJsonPath, name, range, true));
      }
      for (const [name, command] of Object.entries(installFields.scripts)) {
        manifest = claim(manifest, target, `scripts.${name}`, owner);
        plan.push({ op: "modify", path: target, detail: `script ${name}` });
        if (!dryRun) deferredWrites.push(() => addPackageScript(pkgJsonPath, name, command));
      }
      touchedFiles.add(target);
    }
  }

  // 3. Env vars in .env.example at repo root.
  if (installFields.env.length > 0) {
    const envFile = path.join(projectRoot, ".env.example");
    const envOp = fs.existsSync(envFile) ? "modify" : "create";
    for (const v of installFields.env) {
      manifest = claim(manifest, ".env.example", v.name, owner);
      plan.push({ op: envOp, path: ".env.example", detail: `env ${v.name}` });
      if (!dryRun) deferredWrites.push(() => addEnvVar(envFile, v.name, v.example, v.description));
    }
    touchedFiles.add(".env.example");
  }

  // 2b. `app` install-fields overlay — routes per-dep into each consuming
  //    app's package.json regardless of category home. Use case: package-home
  //    modules whose app-scoped shims import an npm package that conceptually
  //    belongs with the app (e.g. shadcn-next ships `theme-provider.tsx` into
  //    apps/<id>/components/, but `next-themes` is imported FROM the app, so
  //    the dep belongs in the app's package.json, not packages/ui's). Schema
  //    rejects this overlay for repo-home modules.
  const appFields = installFields.app;
  const hasAppInstall =
    Object.keys(appFields.dependencies).length > 0 ||
    Object.keys(appFields.devDependencies).length > 0 ||
    Object.keys(appFields.scripts).length > 0;
  if (hasAppInstall) {
    const appTargets = targetApps.map((a) => `${a.dir.replace(/\/+$/, "")}/package.json`);
    for (const target of appTargets) {
      const pkgJsonPath = path.join(projectRoot, target);
      if (!fs.existsSync(pkgJsonPath)) {
        throw new Error(`Cannot apply ${module.id} app overlay: ${target} doesn't exist.`);
      }
    }
    const appDeps = dryRun ? appFields.dependencies : await resolveRanges(appFields.dependencies);
    const appDevDeps = dryRun
      ? appFields.devDependencies
      : await resolveRanges(appFields.devDependencies);
    for (const target of appTargets) {
      const pkgJsonPath = path.join(projectRoot, target);
      for (const [name, range] of Object.entries(appDeps)) {
        manifest = claim(manifest, target, `app.dependencies.${name}`, owner);
        plan.push(depAction(target, pkgJsonPath, name, range, false));
        if (!dryRun)
          deferredWrites.push(() => writeDepKeepingHigher(pkgJsonPath, name, range, false));
      }
      for (const [name, range] of Object.entries(appDevDeps)) {
        manifest = claim(manifest, target, `app.devDependencies.${name}`, owner);
        plan.push(depAction(target, pkgJsonPath, name, range, true));
        if (!dryRun)
          deferredWrites.push(() => writeDepKeepingHigher(pkgJsonPath, name, range, true));
      }
      for (const [name, command] of Object.entries(appFields.scripts)) {
        manifest = claim(manifest, target, `app.scripts.${name}`, owner);
        plan.push({ op: "modify", path: target, detail: `script ${name}` });
        if (!dryRun) deferredWrites.push(() => addPackageScript(pkgJsonPath, name, command));
      }
      touchedFiles.add(target);
    }
  }
  if (appFields.env.length > 0) {
    // App-overlay env vars share the same `.env.example` destination — no
    // separate per-app env files yet. Treat them like primary env.
    const envFile = path.join(projectRoot, ".env.example");
    const envOp = fs.existsSync(envFile) ? "modify" : "create";
    for (const v of appFields.env) {
      manifest = claim(manifest, ".env.example", v.name, owner);
      plan.push({ op: envOp, path: ".env.example", detail: `env ${v.name}` });
      if (!dryRun) deferredWrites.push(() => addEnvVar(envFile, v.name, v.example, v.description));
    }
    touchedFiles.add(".env.example");
  }

  // Codemod execution is shared between apply (mutate + persist) and dry-run
  // (enumerate the source files they'd touch, persist nothing). ts-morph edits
  // stay in memory until `project.save()`, which only runs when `persist` is
  // true — so a dry-run *reads* source but never writes. Codemods read peer
  // state from the manifest, not their own (not-yet-persisted) record, so
  // running them against the in-memory manifest is safe in both modes. First-
  // party codemods only ever target pre-existing user/peer files (never a file
  // this same module's deferred template would create), so dry-run's
  // unflushed templates don't break enumeration; a throw is a genuine blocker
  // (e.g. a missing layout) worth surfacing before a real apply.
  const runCodemods = async (
    persist: boolean,
    onSnapshot?: (abs: string) => void,
  ): Promise<void> => {
    if (!adapter.codemods?.length) return;
    const dispatchApps = home.kind === "repo" ? [seedApp] : targetApps;
    const saves: Array<() => Promise<void>> = [];
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
          onSnapshot?.(path.join(projectRoot, file));
          manifest = claim(manifest, file, region, owner);
        },
      });
      for (const invocation of adapter.codemods) {
        const fn = CODEMOD_CATALOG[invocation.id]!;
        const renderedArgs = renderArgs(invocation.args ?? {}, renderContextFor(app));
        const result = await fn.apply(ctx, renderedArgs);
        for (const f of result.touchedFiles) {
          const abs = path.isAbsolute(f) ? f : path.join(projectRoot, f);
          onSnapshot?.(abs);
          const rel = path.relative(projectRoot, abs).replaceAll(path.sep, "/");
          plan.push({ op: "modify", path: rel, detail: `codemod ${invocation.id}` });
          touchedFiles.add(rel);
        }
        // Persist after every codemod so a later throw doesn't lose the
        // already-claimed regions. Cheap (small JSON), and a partial-apply
        // surfaces cleanly to `stanza remove`'s sweep.
        if (persist) writeManifest(projectRoot, manifest);
      }
      saves.push(() => project.save());
    }
    if (persist) for (const save of saves) await save();
  };

  if (dryRun) {
    // Rehearse codemods in-memory so the preview lists the files they'd edit.
    // Nothing is saved.
    await runCodemods(false);
    return { manifest, touchedFiles: [...touchedFiles], dryRun, plan, bootstrappedPackage };
  }

  // Snapshot every file we're about to touch so a throw anywhere in the
  // mutation phase rolls the worktree back to its pre-apply state instead of
  // leaving a partial change. Captured up front (the pre-transaction bytes);
  // codemod targets that surface later are snapshotted as they're claimed.
  const tx = new FileTx();
  tx.snapshot(manifestPath(projectRoot));
  for (const rel of touchedFiles) tx.snapshot(path.join(projectRoot, rel));
  if (packageRoot) {
    tx.snapshot(path.join(packageRoot, "package.json"));
    tx.snapshot(path.join(packageRoot, "tsconfig.json"));
  }
  for (const app of targetApps) tx.snapshot(path.join(projectRoot, app.dir, "package.json"));

  try {
    const record = recordFor(module, adapter, targetApps, namespace);
    // Push into the category's array, replacing any same-(id, apps-key)
    // record so re-adds are idempotent. Single-choice categories with
    // home:"app" are kept to one record per app id by `add`/`init`
    // validation; other homes stay capped at ≤ 1 total.
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

    for (const write of slotBootstrapWrites) write();
    for (const write of deferredWrites) write();

    // Codemods dispatch once per targeted app (or once with the seed app for
    // repo-home). ts-morph edits stay in memory until `project.save()` runs
    // last, so a codemod throw never reaches disk; direct-fs codemods are
    // snapshotted as they claim / report touched files.
    await runCodemods(true, (abs) => tx.snapshot(abs));
  } catch (err) {
    // Restore the worktree to its pre-apply state, then surface the error.
    tx.rollback();
    throw err;
  }

  return { manifest, touchedFiles: [...touchedFiles], dryRun, plan, bootstrappedPackage };
}

export function recordFor(
  module: Module,
  adapter: ModuleAdapter,
  targetApps: AppSpec[],
  namespace: string | undefined,
): {
  id: string;
  version: string;
  adapter: string;
  apps?: string[];
  namespace?: string;
  codemods?: Array<{ id: string; args?: Record<string, unknown> }>;
  consumesPackages?: string[];
} {
  const home = categoryHome(module.category);
  const base: {
    id: string;
    version: string;
    adapter: string;
    apps?: string[];
    namespace?: string;
    codemods?: Array<{ id: string; args?: Record<string, unknown> }>;
    consumesPackages?: string[];
  } = { id: module.id, version: module.version, adapter: adapter.key };
  if (namespace) base.namespace = namespace;
  // Snapshot enough state for revert to run offline / after the upstream
  // registry has renamed adapters or shuffled codemod ids.
  if (adapter.codemods?.length) {
    base.codemods = adapter.codemods.map((c) => ({
      id: c.id,
      ...(c.args ? { args: c.args } : {}),
    }));
  }
  if (module.consumesPackages?.length) base.consumesPackages = [...module.consumesPackages];
  if (home.kind === "repo") return base;
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
 * Plan the slot-package bootstrap as a list of write thunks. Returning thunks
 * (vs writing inline) keeps the manifest-leads-disk contract: the caller
 * queues these alongside template/dep writes, so a mid-apply throw never
 * leaves orphan disk state the manifest can't sweep.
 *
 * The package's own `package.json` and `tsconfig.json` are NOT claimed as
 * regions: they're shared by every module that lives in the package (e.g. db
 * + orm both write into packages/db/). The remove path's package-dir sweep
 * deletes them only after every module has released its claims under
 * `packages/<dir>/`.
 */
export function planSlotPackageBootstrap(args: {
  projectRoot: string;
  consumingApps: AppSpec[];
  manifest: StanzaManifest;
  packageDir: string;
  packageName: string;
  packageRoot: string;
  consumesPackages: string[];
}): { created: boolean; writes: Array<() => void> } {
  const { projectRoot, consumingApps, packageDir, packageName, packageRoot, consumesPackages } =
    args;
  const pkgPath = path.join(packageRoot, "package.json");
  const tsconfigPath = path.join(packageRoot, "tsconfig.json");

  const writes: Array<() => void> = [];
  let created = false;

  // Build the slot's package.json in memory so consumesPackages wiring can
  // mutate it alongside bootstrap. If it already exists on disk, we layer
  // the cross-package deps via addPackageDependency at flush time.
  const slotExists = fs.existsSync(pkgPath);
  const slotPkg: { dependencies?: Record<string, string> } = slotExists
    ? JSON.parse(fs.readFileSync(pkgPath, "utf8"))
    : slotPackageJsonBase({ name: args.manifest.name, dir: packageDir });
  if (!slotExists) created = true;

  if (!fs.existsSync(tsconfigPath)) {
    created = true;
    writes.push(() => {
      const compilerOptions: Record<string, unknown> = {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        module: "esnext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        noUncheckedIndexedAccess: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        types: ["node"],
      };
      if (packageDir === "ui") {
        compilerOptions.baseUrl = ".";
        compilerOptions.paths = { [`${packageName}/*`]: ["./src/*"] };
      }
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({ compilerOptions, include: ["src"], exclude: ["node_modules"] }, null, 2) +
          "\n",
        "utf8",
      );
    });
  }

  // Consuming apps: workspace dep wiring.
  for (const app of consumingApps) {
    const appPkgPath = path.join(projectRoot, app.dir, "package.json");
    if (!fs.existsSync(appPkgPath)) continue;
    const appPkg: { dependencies?: Record<string, string> } = JSON.parse(
      fs.readFileSync(appPkgPath, "utf8"),
    );
    if (appPkg.dependencies?.[packageName] !== "workspace:*") {
      created = true;
      writes.push(() => addPackageDependency(appPkgPath, packageName, "workspace:*"));
    }
  }

  // consumesPackages: mutate slotPkg in memory; pending deps go through
  // addPackageDependency at flush time when the slot already exists.
  const pendingPeers: string[] = [];
  if (consumesPackages.length > 0) {
    slotPkg.dependencies = slotPkg.dependencies ?? {};
    for (const peer of consumesPackages) {
      if (peer === packageDir) continue;
      if (!PACKAGE_DIRS.has(peer)) continue;
      const peerName = `@${args.manifest.name}/${peer}`;
      if (slotPkg.dependencies[peerName] !== "workspace:*") {
        slotPkg.dependencies[peerName] = "workspace:*";
        created = true;
        if (slotExists) pendingPeers.push(peerName);
      }
    }
  }

  // Write the slot's package.json: either a fresh bootstrap (carrying any
  // consumesPackages deps we baked in) or layered updates onto an existing file.
  if (!slotExists) {
    writes.push(() => {
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(pkgPath, JSON.stringify(slotPkg, null, 2) + "\n", "utf8");
    });
  } else if (pendingPeers.length > 0) {
    writes.push(() => {
      for (const peerName of pendingPeers) {
        addPackageDependency(pkgPath, peerName, "workspace:*");
      }
    });
  }

  return { created, writes };
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
      // Render keys too — `set-tsconfig-paths` and similar codemods use
      // mustache-substituted strings as object keys (e.g. `"@<name>/ui/*"`).
      // Keys without `{{ }}` pass through Handlebars unchanged, so this is
      // safe for the other codemods whose keys are stable identifiers.
      for (const [k, v] of Object.entries(value)) {
        out[renderTemplate(k, context)] = visit(v);
      }
      return out;
    }
    return value;
  };
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(args)) out[renderTemplate(k, context)] = visit(v);
  return out;
}

/**
 * Resolve a template's source text. Every module carries its template bodies
 * inlined in `tpl.content` (the registry build bakes them in), so this is a
 * straight read. A missing `content` means a malformed module — error early.
 */
function readTemplateSource(tpl: TemplateRef): string {
  if (tpl.content === undefined) {
    throw new Error(
      `Template "${tpl.src}" has no inlined content. Registry modules must inline ` +
        `template content (run the registry build) before publishing.`,
    );
  }
  return tpl.content;
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

function buildRevertContext(args: {
  projectRoot: string;
  app: AppSpec;
  appRoot: string;
  manifest: StanzaManifest;
  category: CategoryId;
  moduleId: string;
  adapterKey: string;
  project: () => Project;
  touchedFiles: Set<string>;
  dryRun: boolean;
  onRelease?: (file: string, region: string) => void;
}): CodemodContext {
  return {
    projectRoot: args.projectRoot,
    app: args.app,
    appRoot: args.appRoot,
    project: args.project,
    manifest: args.manifest,
    owner: { category: args.category, module: args.moduleId },
    adapter: args.adapterKey,
    claimRegion() {},
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
  /**
   * Category + module id of the install being reverted. Used to bind the
   * codemod context (`owner`) and to derive the `packages/<dir>` home for
   * package-home categories.
   */
  category: CategoryId;
  moduleId: string;
  /** Adapter key recorded at install time — passed through for context only. */
  adapterKey: string;
  /** Codemod invocations to revert (snapshotted on the manifest record). */
  codemods: Array<{ id: string; args?: Record<string, unknown> }>;
  /** Persisted consumesPackages so the render context resolves correctly offline. */
  consumesPackages?: string[];
  targetApps: AppSpec[];
  dryRun: boolean;
}): Promise<RevertResult> {
  const { projectRoot, category, moduleId, adapterKey, codemods, targetApps, dryRun } = args;
  let manifest = args.manifest;
  const touchedFiles = new Set<string>();
  const manualCleanup: string[] = [];

  if (codemods.length === 0) return { manifest, touchedFiles: [], dryRun, manualCleanup };
  if (targetApps.length === 0) {
    return { manifest, touchedFiles: [], dryRun, manualCleanup };
  }

  const home = categoryHome(category);
  const packageName = home.kind === "package" ? `@${manifest.name}/${home.dir}` : "";
  const dispatchApps = home.kind === "repo" ? [targetApps[0]!] : targetApps;

  for (const app of dispatchApps) {
    const appRoot = path.join(projectRoot, app.dir);
    const renderContext = buildRenderContext({
      projectName: manifest.name,
      app,
      packageName,
      peers: activePeerIds(manifest, app.id),
      envNames: declaredEnvNames(manifest),
      consumesPackages: args.consumesPackages,
    });
    const project = lazyProject(appRoot);
    const ctx = buildRevertContext({
      projectRoot,
      app,
      appRoot,
      manifest,
      category,
      moduleId,
      adapterKey,
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
        // Persisted args' static type is `Record<string, unknown>` (Zod
        // accepts hand-edited manifests), but at runtime they're always
        // JSON-shaped because they came from the registry. Pass through.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const rawArgs = (invocation.args ?? {}) as Record<string, JsonValue>;
        const renderedArgs = renderArgs(rawArgs, renderContext);
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

// Avoid clobbering a user-pinned range with the module's declared one when
// the user is already on a newer version. Both ranges go through
// `semver.minVersion` and the higher pin wins; non-semver values
// (workspace:*, link:, etc.) are preserved when present.
export function writeDepKeepingHigher(
  pkgJsonPath: string,
  name: string,
  incoming: string,
  dev: boolean,
): void {
  const key = dev ? "devDependencies" : "dependencies";
  const raw = fs.readFileSync(pkgJsonPath, "utf8");
  const pkg: Record<string, Record<string, string> | undefined> = JSON.parse(raw);
  const existing = pkg[key]?.[name];
  if (existing && shouldKeepExisting(existing, incoming)) return;
  addPackageDependency(pkgJsonPath, name, incoming, { dev });
}

function shouldKeepExisting(existing: string, incoming: string): boolean {
  if (existing === incoming) return true;
  // Preserve any non-semver pin (workspace:*, link:, git+…, file:, etc.).
  if (!isSemverishRange(existing)) return true;
  if (!isSemverishRange(incoming)) return false;
  const a = semver.minVersion(existing);
  const b = semver.minVersion(incoming);
  if (!a || !b) return false;
  return semver.gte(a, b);
}

function isSemverishRange(v: string): boolean {
  return semver.validRange(v) !== null;
}

/**
 * Plan entry for a template write. `create` vs `modify` is decided by whether
 * the destination already exists — surfacing that a template would overwrite a
 * file the user may have authored (Stanza templates overwrite unconditionally).
 */
function templateAction(rel: string, dest: string): PlanAction {
  return fs.existsSync(dest)
    ? { op: "modify", path: rel, detail: "template (overwrites)" }
    : { op: "create", path: rel, detail: "template" };
}

/**
 * Plan entry for a dependency write. Mirrors `writeDepKeepingHigher`'s decision
 * via the shared `shouldKeepExisting` so the preview's `skip` matches what the
 * writer would actually do — a user already on a newer (or non-semver) pin is
 * left untouched.
 */
function depAction(
  target: string,
  pkgJsonPath: string,
  name: string,
  incoming: string,
  dev: boolean,
): PlanAction {
  const detail = `${dev ? "dev dependency" : "dependency"} ${name}`;
  if (wouldKeepExisting(pkgJsonPath, name, incoming, dev)) {
    return { op: "skip", path: target, detail, reason: "newer version already pinned" };
  }
  return { op: "modify", path: target, detail };
}

/**
 * Read-only counterpart to `writeDepKeepingHigher`: returns true when the
 * existing pin would be kept (so the planner can mark a `skip` without writing).
 * Shares `shouldKeepExisting` so planner and writer can't disagree.
 */
function wouldKeepExisting(
  pkgJsonPath: string,
  name: string,
  incoming: string,
  dev: boolean,
): boolean {
  if (!fs.existsSync(pkgJsonPath)) return false;
  const key = dev ? "devDependencies" : "dependencies";
  const pkg: Record<string, Record<string, string> | undefined> = JSON.parse(
    fs.readFileSync(pkgJsonPath, "utf8"),
  );
  const existing = pkg[key]?.[name];
  return existing !== undefined && shouldKeepExisting(existing, incoming);
}
