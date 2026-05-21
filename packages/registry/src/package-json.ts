import {
  ADDON_PACKAGE_DIR,
  type AddonCategoryId,
  type EnvVar,
  type Module,
  type ModuleAdapter,
  SLOT_PACKAGE_DIR,
  type SlotId,
} from "./module";
import { addonOrder, slotOrder } from "./resolver";

export type PackageManager = "pnpm" | "bun" | "npm";

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
};

/**
 * Combine a module's shared install fields with the chosen adapter's overrides.
 * Adapter values win per-key. Env merges by `name`. Single source of truth for
 * both the CLI's apply path and the web builder's preview synthesis, so the two
 * can never disagree about what a selection installs.
 */
export function mergeInstallFields(module: Module, adapter: ModuleAdapter): MergedInstallFields {
  const envByName = new Map<string, EnvVar>();
  for (const v of module.env ?? []) envByName.set(v.name, v);
  for (const v of adapter.env ?? []) envByName.set(v.name, v);
  return {
    dependencies: { ...module.dependencies, ...adapter.dependencies },
    devDependencies: { ...module.devDependencies, ...adapter.devDependencies },
    scripts: { ...module.scripts, ...adapter.scripts },
    env: [...envByName.values()],
  };
}

const PM_VERSION: Record<PackageManager, string> = {
  pnpm: "pnpm@10.33.4",
  bun: "bun@1.3.14",
  npm: "npm@10.9.0",
};

/** Last path segment of a repo-relative dir (no node:path dependency — runs in the browser too). */
function baseName(dir: string): string {
  const parts = dir.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] ?? dir;
}

/**
 * Root `package.json`. pnpm reads its workspace globs from `pnpm-workspace.yaml`,
 * so the `workspaces` field is emitted only for bun/npm.
 */
export function rootPackageJson(opts: {
  name: string;
  packageManager: PackageManager;
}): PackageJson {
  const { name, packageManager } = opts;
  const pkg: PackageJson = {
    name,
    private: true,
    version: "0.1.0",
    packageManager: PM_VERSION[packageManager],
    scripts: {
      dev: `${packageManager} -r run dev`,
      build: `${packageManager} -r run build`,
      test: `${packageManager} -r run test`,
    },
  };
  if (packageManager !== "pnpm") pkg.workspaces = ["apps/*", "packages/*"];
  return pkg;
}

/** App-shell `package.json` — layout-correct but empty; modules merge deps/scripts in. */
export function appPackageJsonBase(opts: { name: string; appDir: string }): PackageJson {
  return {
    name: `@${opts.name}/${baseName(opts.appDir)}`,
    version: "0.0.0",
    private: true,
    type: "module",
  };
}

/** Slot-package `package.json` for `packages/<dir>/` — matches the CLI's `ensureSlotPackage`. */
export function slotPackageJsonBase(opts: { name: string; dir: string }): PackageJson {
  return {
    name: `@${opts.name}/${opts.dir}`,
    version: "0.0.0",
    private: true,
    type: "module",
    main: "./src/index.ts",
    types: "./src/index.ts",
    exports: { ".": "./src/index.ts" },
  };
}

export type ResolvedEntry = { module: Module; adapter: ModuleAdapter };
export type ResolvedSlots = Partial<Record<SlotId, ResolvedEntry>>;
export type ResolvedAddons = Partial<Record<AddonCategoryId, ResolvedEntry[]>>;

const KNOWN_PACKAGE_DIRS = new Set(
  Object.values(SLOT_PACKAGE_DIR).filter((d): d is string => d !== null),
);

function addDep(pkg: PackageJson, name: string, range: string, dev = false): void {
  const key = dev ? "devDependencies" : "dependencies";
  const map = (pkg[key] ??= {});
  if (map[name] === undefined) map[name] = range;
}

function applyFields(pkg: PackageJson, fields: MergedInstallFields): void {
  for (const [name, range] of Object.entries(fields.dependencies)) addDep(pkg, name, range);
  for (const [name, range] of Object.entries(fields.devDependencies))
    addDep(pkg, name, range, true);
  for (const [name, command] of Object.entries(fields.scripts)) {
    const scripts = (pkg.scripts ??= {});
    if (scripts[name] === undefined) scripts[name] = command;
  }
}

/**
 * Compute the `package.json` files stanza would write for a resolved selection —
 * root, app, and one per extracted slot package (`packages/<dir>/`). Pure: takes
 * the resolved modules/adapters and emits `{ repoRelativePath -> PackageJson }`.
 *
 * Mirrors the CLI's apply path: module/adapter install fields route to the slot's
 * package when `SLOT_PACKAGE_DIR[slot]` is non-null (otherwise the app), each
 * extracted package wires a `workspace:*` dep into the app, and `consumesPackages`
 * wires cross-package `workspace:*` deps into the consuming package. `env` is
 * intentionally ignored here — it lands in `.env.example`, not a `package.json`.
 *
 * Slots are processed in `slotOrder`, then add-ons in `addonOrder`, so the
 * emitted key order matches the order the CLI appends them on disk.
 */
export function synthesizePackageJsons(
  slots: ResolvedSlots,
  addons: ResolvedAddons,
  opts: { name: string; appDir?: string; packageManager?: PackageManager },
): Record<string, PackageJson> {
  const name = opts.name;
  const appDir = (opts.appDir ?? "apps/web").replace(/\/+$/, "");
  const packageManager = opts.packageManager ?? "pnpm";

  const app = appPackageJsonBase({ name, appDir });
  const packages = new Map<string, PackageJson>();

  const ensurePkg = (dir: string): PackageJson => {
    let pkg = packages.get(dir);
    if (!pkg) {
      pkg = slotPackageJsonBase({ name, dir });
      packages.set(dir, pkg);
    }
    return pkg;
  };

  const route = (
    dir: string | null,
    fields: MergedInstallFields,
    consumesPackages: readonly string[],
  ) => {
    if (dir) {
      const pkg = ensurePkg(dir);
      // The host app consumes the extracted package as a workspace dep.
      addDep(app, `@${name}/${dir}`, "workspace:*");
      // Cross-package imports (e.g. auth → db) wire a workspace dep into this
      // package. The CLI does this in `ensureSlotPackage` — i.e. before the
      // module's own install fields — so wire it first to match emit order.
      // Skip self-references and dirs that aren't real slot packages.
      for (const peer of consumesPackages) {
        if (peer === dir || !KNOWN_PACKAGE_DIRS.has(peer)) continue;
        addDep(pkg, `@${name}/${peer}`, "workspace:*");
      }
      applyFields(pkg, fields);
    } else {
      applyFields(app, fields);
    }
  };

  for (const slot of slotOrder) {
    const entry = slots[slot];
    if (!entry) continue;
    route(
      SLOT_PACKAGE_DIR[slot],
      mergeInstallFields(entry.module, entry.adapter),
      entry.module.consumesPackages ?? [],
    );
  }

  for (const category of addonOrder) {
    for (const entry of addons[category] ?? []) {
      route(
        ADDON_PACKAGE_DIR[category],
        mergeInstallFields(entry.module, entry.adapter),
        entry.module.consumesPackages ?? [],
      );
    }
  }

  const out: Record<string, PackageJson> = {
    "package.json": rootPackageJson({ name, packageManager }),
    [`${appDir}/package.json`]: app,
  };
  for (const [dir, pkg] of packages) out[`packages/${dir}/package.json`] = pkg;
  return out;
}
