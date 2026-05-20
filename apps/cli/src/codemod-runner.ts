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
import { SLOT_PACKAGE_DIR } from "@stanza/registry";

import { writeManifest } from "./manifest";
import { claim, RegionConflictError } from "./region-tracker";

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
  const moduleDir = path.join(registryRoot, "modules", `${module.slot}-${module.id}`);

  // Slot → package mapping. When non-null, this slot's templates/deps/scripts
  // are routed into `packages/<packageDir>/` instead of into the active app.
  const packageDir = SLOT_PACKAGE_DIR[module.slot];
  const packageRoot = packageDir ? path.join(projectRoot, "packages", packageDir) : null;
  const packageName = packageDir ? `@${manifest.name}/${packageDir}` : "";

  const needsPackage =
    packageDir !== null &&
    (Boolean(adapter.templates?.some((t) => t.scope === "package")) ||
      Boolean(adapter.dependencies && Object.keys(adapter.dependencies).length > 0) ||
      Boolean(adapter.devDependencies && Object.keys(adapter.devDependencies).length > 0) ||
      Boolean(adapter.scripts && Object.keys(adapter.scripts).length > 0));

  let bootstrappedPackage: { dir: string; name: string } | undefined;
  if (needsPackage && packageDir && packageRoot) {
    const created = ensureSlotPackage({
      projectRoot,
      appRoot,
      manifest,
      packageDir,
      packageName,
      packageRoot,
      peerPackages: adapter.peerPackages ?? [],
      dryRun,
    });
    if (created) bootstrappedPackage = { dir: packageDir, name: packageName };
  }

  // Render context provides `{{packageName}}` for the active module's own
  // package, plus shorthand `{{<dir>PackageName}}` keys for every slot package
  // so cross-package imports (e.g. better-auth's auth.ts importing `db` from
  // `@<project>/db`) can be templated declaratively.
  const renderContext: Record<string, string> = {
    appDir: manifest.appDir,
    projectName: manifest.name,
    packageName,
  };
  for (const dir of new Set(
    Object.values(SLOT_PACKAGE_DIR).filter((d): d is string => d !== null),
  )) {
    renderContext[`${dir}PackageName`] = `@${manifest.name}/${dir}`;
  }

  // 1. Templates (claim regions per-template-file).
  for (const tpl of adapter.templates ?? []) {
    const dest = resolveTemplateDest({ tpl, projectRoot, appRoot, packageRoot, slot: module.slot });
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
  const pkgJsonPath = packageRoot
    ? path.join(packageRoot, "package.json")
    : path.join(appRoot, "package.json");
  if (
    (adapter.dependencies || adapter.devDependencies || adapter.scripts) &&
    fs.existsSync(pkgJsonPath)
  ) {
    for (const [name, range] of Object.entries(adapter.dependencies ?? {})) {
      manifest = claim(
        manifest,
        path.relative(projectRoot, pkgJsonPath),
        `dependencies.${name}`,
        owner,
      );
      if (!dryRun) addPackageDependency(pkgJsonPath, name, range);
    }
    for (const [name, range] of Object.entries(adapter.devDependencies ?? {})) {
      manifest = claim(
        manifest,
        path.relative(projectRoot, pkgJsonPath),
        `devDependencies.${name}`,
        owner,
      );
      if (!dryRun) addPackageDependency(pkgJsonPath, name, range, { dev: true });
    }
    for (const [name, command] of Object.entries(adapter.scripts ?? {})) {
      manifest = claim(manifest, path.relative(projectRoot, pkgJsonPath), `scripts.${name}`, owner);
      if (!dryRun) addPackageScript(pkgJsonPath, name, command);
    }
    touchedFiles.add(path.relative(projectRoot, pkgJsonPath));
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
      project,
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
          `Codemod "${invocation.id}" not in the catalog. Add it to packages/codemods/src/builtins/ and register in builtins/index.ts.`,
        );
      }
      if (!dryRun) {
        const renderedArgs = renderArgs(invocation.args ?? {}, renderContext);
        const result = await fn.apply(ctx, renderedArgs);
        result.touchedFiles.forEach((f) => touchedFiles.add(f));
      }
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

  return { manifest, touchedFiles: [...touchedFiles], dryRun, bootstrappedPackage };
}

function resolveTemplateDest(args: {
  tpl: TemplateRef;
  projectRoot: string;
  appRoot: string;
  packageRoot: string | null;
  slot: SlotId;
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
  peerPackages: string[];
  dryRun: boolean;
}): boolean {
  const { appRoot, packageDir, packageName, packageRoot, peerPackages, dryRun } = args;
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
        JSON.stringify(
          {
            name: packageName,
            version: "0.0.0",
            private: true,
            type: "module",
            main: "./src/index.ts",
            types: "./src/index.ts",
            exports: { ".": "./src/index.ts" },
          },
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
  if (peerPackages.length > 0) {
    const allowed = new Set(Object.values(SLOT_PACKAGE_DIR).filter((d): d is string => d !== null));
    const ownPkgJson = path.join(packageRoot, "package.json");
    for (const peer of peerPackages) {
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
