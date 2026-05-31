import {
  type AppSpec,
  categoryHome,
  type CategoryId,
  defaultWebApp,
  type EnvVar,
  type InstallHome,
  type Module,
  type ModuleAdapter,
  PACKAGE_DIRS,
  type PackageManager,
} from "@withstanza/schema";

import { categoryOrder } from "./resolver";
import { pmRecursive } from "./template";

/** Minimal package.json shape we author. Field order here is the emit order. */
export type PackageJson = {
  name?: string;
  private?: boolean;
  version?: string;
  packageManager?: string;
  type?: string;
  main?: string;
  types?: string;
  exports?: Record<string, unknown>;
  workspaces?: string[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Merged install fields after combining a module's shared fields with an adapter's. */
export type MergedInstallFields = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  env: EnvVar[];
  /**
   * App-routed overlay: same shape as the primary fields, but destined for
   * the consuming app(s)' `package.json` instead of the module's home target.
   * Always present (possibly empty) for downstream-callsite ergonomics.
   */
  app: {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
    env: EnvVar[];
  };
};

/**
 * Combine a module's shared install fields with the chosen adapter's overrides.
 * Adapter values win per-key. Env merges by `name`. Single source of truth for
 * both the CLI's apply path and the web builder's preview synthesis, so the two
 * can never disagree about what a selection installs.
 *
 * The `app` overlay merges identically — module-level `app.*` defaults are
 * overridden per-key by adapter-level `app.*`.
 */
export function mergeInstallFields(module: Module, adapter: ModuleAdapter): MergedInstallFields {
  const envByName = new Map<string, EnvVar>();
  for (const v of module.env ?? []) envByName.set(v.name, v);
  for (const v of adapter.env ?? []) envByName.set(v.name, v);

  const appEnvByName = new Map<string, EnvVar>();
  for (const v of module.app?.env ?? []) appEnvByName.set(v.name, v);
  for (const v of adapter.app?.env ?? []) appEnvByName.set(v.name, v);

  return {
    dependencies: { ...module.dependencies, ...adapter.dependencies },
    devDependencies: { ...module.devDependencies, ...adapter.devDependencies },
    scripts: { ...module.scripts, ...adapter.scripts },
    env: [...envByName.values()],
    app: {
      dependencies: { ...module.app?.dependencies, ...adapter.app?.dependencies },
      devDependencies: { ...module.app?.devDependencies, ...adapter.app?.devDependencies },
      scripts: { ...module.app?.scripts, ...adapter.app?.scripts },
      env: [...appEnvByName.values()],
    },
  };
}

/**
 * Repo-relative `package.json` paths a module's install fields route into.
 * Length depends on the module's category `home`:
 *
 *  - `home: "package"` → one entry: `packages/<dir>/package.json` (apps ignored)
 *  - `home: "repo"`    → one entry: `package.json` (apps ignored)
 *  - `home: "app"`     → one entry per app in `apps`
 *
 * Single source of truth for both the CLI runner's apply path and the web
 * builder's preview synthesis, so deps land in the same `package.json`(s) in
 * both.
 */
export function installPackageJsonTargets(module: Module, apps: AppSpec[]): string[] {
  const home = categoryHome(module.category);
  if (home.kind === "package") return [`packages/${home.dir}/package.json`];
  if (home.kind === "repo") return ["package.json"];
  return apps.map((a) => `${a.dir.replace(/\/+$/, "")}/package.json`);
}

/**
 * Floor version per package manager — used when the caller doesn't supply a
 * resolved version. The CLI runs this through `resolveExactVersion` at init
 * time so newly-generated projects get the latest matching release; the web
 * preview's synth path uses the floor as-is to avoid per-render npm lookups.
 * Stored as bare versions (no `${pm}@` prefix) so callers can feed them
 * directly into the version resolver.
 */
export const PM_FLOOR_VERSION: Record<PackageManager, string> = {
  pnpm: "10.33.4",
  bun: "1.3.14",
  npm: "10.9.0",
};

/**
 * Root `package.json`. pnpm reads its workspace globs from `pnpm-workspace.yaml`,
 * so the `workspaces` field is emitted only for bun/npm.
 *
 * Default `dev`/`build`/`test`/`lint` scripts use the pm's native workspace
 * fan-out via {@link pmRecursive}. Installing a `monorepo` module (e.g.
 * `monorepo-turbo`) overwrites these with the orchestrator's invocation —
 * which is why each script has a region claim of its own on the runner side.
 *
 * `packageManagerVersion` overrides the floor — pass a resolver result (e.g.
 * from `resolveExactVersion`) to pin to the latest matching release. Corepack
 * requires an exact version, so this value must not carry a `^`/`~` prefix.
 */
export function rootPackageJson(opts: {
  name: string;
  packageManager: PackageManager;
  packageManagerVersion?: string;
}): PackageJson {
  const { name, packageManager } = opts;
  const pmVersion = opts.packageManagerVersion ?? PM_FLOOR_VERSION[packageManager];
  const pkg: PackageJson = {
    name,
    private: true,
    version: "0.1.0",
    packageManager: `${packageManager}@${pmVersion}`,
    scripts: {
      dev: pmRecursive(packageManager, "dev"),
      build: pmRecursive(packageManager, "build"),
      test: pmRecursive(packageManager, "test"),
      lint: pmRecursive(packageManager, "lint"),
    },
  };
  if (packageManager !== "pnpm") pkg.workspaces = ["apps/*", "packages/*"];
  return pkg;
}

/**
 * App-shell `package.json` — layout-correct but empty; modules merge deps/scripts
 * in. The package name is derived from `app.id` (so the workspace handle is
 * stable even if you rename the app's directory).
 */
export function appPackageJsonBase(opts: { name: string; app: AppSpec }): PackageJson {
  return {
    name: `@${opts.name}/${opts.app.id}`,
    version: "0.0.0",
    private: true,
    type: "module",
  };
}

/**
 * Subpath-`exports` map per package home. The `ui` home doesn't ship a barrel
 * — apps import shadcn-style subpaths (`@<name>/ui/lib/utils`, etc.) — so the
 * bootstrap omits `main`/`types` + the `.` entry.
 *
 * Keep keys to *real* `home.dir` values from `CATEGORIES`. Unknown dirs fall
 * back to the barrel shape (one `.` entry → `./src/index.ts`).
 */
const PACKAGE_EXPORTS: Record<string, PackageJson> = {
  ui: {
    type: "module",
    exports: {
      "./globals.css": "./src/styles/globals.css",
      "./postcss.config": "./postcss.config.mjs",
      "./lib/*": "./src/lib/*.ts",
      "./components/*": "./src/components/*.tsx",
      "./hooks/*": "./src/hooks/*.ts",
    },
  },
};

/** Slot-package `package.json` for `packages/<dir>/` — matches the CLI's `ensureSlotPackage`. */
export function slotPackageJsonBase(opts: { name: string; dir: string }): PackageJson {
  const base: PackageJson = {
    name: `@${opts.name}/${opts.dir}`,
    version: "0.0.0",
    private: true,
    type: "module",
  };
  const override = PACKAGE_EXPORTS[opts.dir];
  if (override) return { ...base, ...override };
  return {
    ...base,
    main: "./src/index.ts",
    types: "./src/index.ts",
    exports: { ".": "./src/index.ts" },
  };
}

export type ResolvedEntry = { module: Module; adapter: ModuleAdapter };
/** Resolved selection, keyed by category. Each category holds 0..n entries. */
export type Resolved = Partial<Record<CategoryId, ResolvedEntry[]>>;

function addDep(pkg: PackageJson, name: string, range: string, dev = false): void {
  const key = dev ? "devDependencies" : "dependencies";
  const map = (pkg[key] ??= {});
  const existing = map[name];
  if (existing === undefined || existing === range) {
    map[name] = range;
    return;
  }
  // Conflicting ranges across modules: pick the higher version so synth output
  // is module-order-independent. The CLI's region tracker hard-fails on the
  // same case, so genuine conflicts still surface at install time.
  map[name] = pickHigherRange(existing, range);
}

/** Non-semver ranges (`workspace:*`, git URLs) compare lexically — fine in practice. */
function pickHigherRange(a: string, b: string): string {
  return compareSemver(a.replace(/^[\^~]/, ""), b.replace(/^[\^~]/, "")) >= 0 ? a : b;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = Number(pa[i] ?? "0");
    const nb = Number(pb[i] ?? "0");
    if (Number.isNaN(na) || Number.isNaN(nb)) return a < b ? -1 : a > b ? 1 : 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function applyFields(pkg: PackageJson, fields: MergedInstallFields): void {
  for (const [name, range] of Object.entries(fields.dependencies)) addDep(pkg, name, range);
  for (const [name, range] of Object.entries(fields.devDependencies))
    addDep(pkg, name, range, true);
  for (const [name, command] of Object.entries(fields.scripts)) {
    // Overwrite, matching the CLI's `addPackageScript` (setJsonPath) semantics.
    // Region tracking is the inter-module conflict guard; a module-declared
    // script intentionally wins over `rootPackageJson`-seeded defaults (e.g.
    // turbo's `dev: "turbo run dev"` replacing the seeded `pnpm -r run dev`).
    (pkg.scripts ??= {})[name] = command;
  }
}

/**
 * Compute the `package.json` files stanza would write for a resolved selection —
 * root, one per app, and one per extracted package (`packages/<dir>/`). Pure:
 * takes the resolved modules/adapters and emits `{ repoRelativePath -> PackageJson }`.
 *
 * Mirrors the CLI's apply path: install fields route via `categoryHome` (apps,
 * repo root, or `packages/<dir>/`); each extracted package wires a `workspace:*`
 * dep into every consuming app, and `consumesPackages` wires cross-package
 * `workspace:*` deps into the consuming package. `env` is intentionally ignored
 * here — it lands in `.env.example`, not a `package.json`.
 *
 * Entries are processed in `categoryOrder`, so the emitted key order matches
 * the order the CLI appends them on disk.
 *
 * For `home: app` entries the `targetApps` list is the entry's `apps` filter
 * intersected with the project's apps; the synthesizer iterates that list to
 * route deps/scripts into every targeted app's package.json. `home: package`
 * entries write the package once and wire `workspace:*` into every consuming
 * app (full app list when the entry omits `apps`, otherwise the listed apps).
 */
export type SynthesizeEntry = ResolvedEntry & { apps?: string[] };

export function synthesizePackageJsons(
  resolved: Partial<Record<CategoryId, SynthesizeEntry[]>>,
  opts: { name: string; apps?: AppSpec[]; packageManager?: PackageManager },
): Record<string, PackageJson> {
  const name = opts.name;
  const apps = opts.apps && opts.apps.length > 0 ? opts.apps : [defaultWebApp()];
  const packageManager = opts.packageManager ?? "pnpm";

  const root = rootPackageJson({ name, packageManager });
  const appPkgs = new Map<string, PackageJson>();
  for (const app of apps) appPkgs.set(app.id, appPackageJsonBase({ name, app }));
  const packages = new Map<string, PackageJson>();

  const ensurePkg = (dir: string): PackageJson => {
    let pkg = packages.get(dir);
    if (!pkg) {
      pkg = slotPackageJsonBase({ name, dir });
      packages.set(dir, pkg);
    }
    return pkg;
  };

  /** Resolve the apps this entry targets, defaulting to every project app. */
  const targetsFor = (entry: SynthesizeEntry): AppSpec[] => {
    if (!entry.apps?.length) return apps;
    const allowed = new Set(entry.apps);
    return apps.filter((a) => allowed.has(a.id));
  };

  /**
   * Apply the `app` overlay to every targeted app. No-op when the overlay has
   * nothing — and a duplicate-but-harmless write when the module is already
   * `home: "app"` (the primary pass put the same fields there).
   */
  const applyAppOverlay = (entry: SynthesizeEntry, fields: MergedInstallFields): void => {
    if (
      Object.keys(fields.app.dependencies).length === 0 &&
      Object.keys(fields.app.devDependencies).length === 0 &&
      Object.keys(fields.app.scripts).length === 0
    ) {
      return;
    }
    for (const app of targetsFor(entry)) {
      const appPkg = appPkgs.get(app.id);
      if (!appPkg) continue;
      for (const [n, r] of Object.entries(fields.app.dependencies)) addDep(appPkg, n, r);
      for (const [n, r] of Object.entries(fields.app.devDependencies)) addDep(appPkg, n, r, true);
      for (const [n, c] of Object.entries(fields.app.scripts)) {
        (appPkg.scripts ??= {})[n] = c;
      }
    }
  };

  // Routing target comes from `categoryHome` — the same decision the CLI applies.
  const route = (entry: SynthesizeEntry, home: InstallHome) => {
    const fields = mergeInstallFields(entry.module, entry.adapter);
    const consumesPackages = entry.module.consumesPackages ?? [];
    if (home.kind === "package") {
      const dir = home.dir;
      const pkg = ensurePkg(dir);
      // Every consuming app gets a workspace dep on the extracted package.
      for (const app of targetsFor(entry)) {
        const appPkg = appPkgs.get(app.id);
        if (appPkg) addDep(appPkg, `@${name}/${dir}`, "workspace:*");
      }
      // Cross-package imports (e.g. auth → db) wire a workspace dep into this
      // package. The CLI does this in `ensureSlotPackage` — i.e. before the
      // module's own install fields — so wire it first to match emit order.
      // Skip self-references and dirs that aren't real package homes.
      for (const peer of consumesPackages) {
        if (peer === dir || !PACKAGE_DIRS.has(peer)) continue;
        addDep(pkg, `@${name}/${peer}`, "workspace:*");
      }
      applyFields(pkg, fields);
      applyAppOverlay(entry, fields);
      return;
    }
    if (home.kind === "repo") {
      // `app` overlay is schema-rejected for repo-home modules, so nothing
      // to fan out here.
      applyFields(root, fields);
      return;
    }
    // home.kind === "app" — route into each targeted app's package.json.
    for (const app of targetsFor(entry)) {
      const appPkg = appPkgs.get(app.id);
      if (appPkg) applyFields(appPkg, fields);
    }
    applyAppOverlay(entry, fields);
  };

  for (const category of categoryOrder) {
    for (const entry of resolved[category] ?? []) {
      route(entry, categoryHome(entry.module.category));
    }
  }

  const out: Record<string, PackageJson> = { "package.json": root };
  for (const app of apps) {
    const pkg = appPkgs.get(app.id);
    if (pkg) out[`${app.dir.replace(/\/+$/, "")}/package.json`] = pkg;
  }
  for (const [dir, pkg] of packages) out[`packages/${dir}/package.json`] = pkg;
  return out;
}
