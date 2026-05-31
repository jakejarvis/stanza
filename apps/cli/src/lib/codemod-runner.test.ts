import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { defineModule, type Module, emptyManifest } from "@withstanza/schema";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { planSlotPackageBootstrap, recordFor, writeDepKeepingHigher } from "./codemod-runner";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-runner-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writePkg(dir: string, pkg: Record<string, unknown>): string {
  const abs = path.join(dir, "package.json");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(pkg, null, 2) + "\n");
  return abs;
}

function readJson(p: string): Record<string, Record<string, string>> {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

describe("writeDepKeepingHigher", () => {
  function setup(initial: Record<string, unknown>): string {
    return writePkg(tmp, initial);
  }

  it("writes a new dep when none exists", () => {
    const pkg = setup({ dependencies: {} });
    writeDepKeepingHigher(pkg, "react", "^19.0.0", false);
    expect(readJson(pkg).dependencies?.react).toBe("^19.0.0");
  });

  it("keeps the user's higher pin instead of downgrading", () => {
    const pkg = setup({ dependencies: { "better-auth": "^1.9.0" } });
    writeDepKeepingHigher(pkg, "better-auth", "^1.6.11", false);
    expect(readJson(pkg).dependencies?.["better-auth"]).toBe("^1.9.0");
  });

  it("upgrades when the incoming range is higher", () => {
    const pkg = setup({ dependencies: { "better-auth": "^1.6.11" } });
    writeDepKeepingHigher(pkg, "better-auth", "^1.9.0", false);
    expect(readJson(pkg).dependencies?.["better-auth"]).toBe("^1.9.0");
  });

  it("preserves workspace:* over a semver incoming", () => {
    const pkg = setup({ dependencies: { "@app/db": "workspace:*" } });
    writeDepKeepingHigher(pkg, "@app/db", "^1.0.0", false);
    expect(readJson(pkg).dependencies?.["@app/db"]).toBe("workspace:*");
  });

  it("writes workspace:* even over an existing semver range", () => {
    const pkg = setup({ dependencies: { "@app/db": "^1.0.0" } });
    writeDepKeepingHigher(pkg, "@app/db", "workspace:*", false);
    expect(readJson(pkg).dependencies?.["@app/db"]).toBe("workspace:*");
  });

  it("routes through devDependencies when `dev: true`", () => {
    const pkg = setup({ dependencies: {}, devDependencies: {} });
    writeDepKeepingHigher(pkg, "vitest", "^4.0.0", true);
    expect(readJson(pkg).devDependencies?.vitest).toBe("^4.0.0");
    expect(readJson(pkg).dependencies?.vitest).toBeUndefined();
  });
});

describe("planSlotPackageBootstrap", () => {
  function setupProject(opts: { withSlotPkg?: boolean; appPkgs?: string[] } = {}): {
    manifest: ReturnType<typeof emptyManifest>;
    packageRoot: string;
    appPkgPath: (appId: string) => string;
  } {
    const manifest = emptyManifest({
      name: "acme",
      apps: (opts.appPkgs ?? ["web"]).map((id) => ({
        id,
        dir: `apps/${id}`,
        kind: "web" as const,
      })),
    });
    for (const app of manifest.apps) {
      writePkg(path.join(tmp, app.dir), { name: `@acme/${app.id}`, dependencies: {} });
    }
    const packageRoot = path.join(tmp, "packages", "db");
    if (opts.withSlotPkg) {
      writePkg(packageRoot, { name: "@acme/db", dependencies: {} });
    }
    return {
      manifest,
      packageRoot,
      appPkgPath: (id) => path.join(tmp, "apps", id, "package.json"),
    };
  }

  it("schedules package.json + tsconfig.json writes when the slot is fresh", () => {
    const { manifest, packageRoot } = setupProject();
    const result = planSlotPackageBootstrap({
      projectRoot: tmp,
      consumingApps: manifest.apps,
      manifest,
      packageDir: "db",
      packageName: "@acme/db",
      packageRoot,
      consumesPackages: [],
    });
    expect(result.created).toBe(true);
    expect(result.writes.length).toBeGreaterThan(0);
    // Disk is untouched until thunks flush.
    expect(fs.existsSync(path.join(packageRoot, "package.json"))).toBe(false);

    for (const w of result.writes) w();
    expect(fs.existsSync(path.join(packageRoot, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, "tsconfig.json"))).toBe(true);
  });

  it("wires the consuming app's workspace dep when fresh", () => {
    const { manifest, packageRoot, appPkgPath } = setupProject();
    const result = planSlotPackageBootstrap({
      projectRoot: tmp,
      consumingApps: manifest.apps,
      manifest,
      packageDir: "db",
      packageName: "@acme/db",
      packageRoot,
      consumesPackages: [],
    });
    for (const w of result.writes) w();
    expect(readJson(appPkgPath("web")).dependencies?.["@acme/db"]).toBe("workspace:*");
  });

  it("bakes consumesPackages into the freshly-written slot package.json", () => {
    const { manifest } = setupProject();
    // Pre-create the orm slot so `db` declaring it as a consumed peer can resolve.
    writePkg(path.join(tmp, "packages", "orm"), { name: "@acme/orm", dependencies: {} });

    const result = planSlotPackageBootstrap({
      projectRoot: tmp,
      consumingApps: manifest.apps,
      manifest,
      packageDir: "auth",
      packageName: "@acme/auth",
      packageRoot: path.join(tmp, "packages", "auth"),
      consumesPackages: ["db"],
    });
    for (const w of result.writes) w();
    const slotPkg = readJson(path.join(tmp, "packages", "auth", "package.json"));
    expect(slotPkg.dependencies?.["@acme/db"]).toBe("workspace:*");
  });

  it("layers consumesPackages onto an existing slot via addPackageDependency", () => {
    const { manifest, packageRoot } = setupProject({ withSlotPkg: true });
    const result = planSlotPackageBootstrap({
      projectRoot: tmp,
      consumingApps: manifest.apps,
      manifest,
      packageDir: "db",
      packageName: "@acme/db",
      packageRoot,
      consumesPackages: ["ui"],
    });
    expect(result.created).toBe(true);
    for (const w of result.writes) w();
    expect(readJson(path.join(packageRoot, "package.json")).dependencies?.["@acme/ui"]).toBe(
      "workspace:*",
    );
  });

  it("is a no-op when the slot is fully wired and consumesPackages is empty", () => {
    const { manifest, packageRoot } = setupProject({ withSlotPkg: true });
    // Pre-wire the app dep so nothing's pending.
    const appPkgAbs = path.join(tmp, "apps/web/package.json");
    fs.writeFileSync(
      appPkgAbs,
      JSON.stringify({ name: "@acme/web", dependencies: { "@acme/db": "workspace:*" } }, null, 2),
    );
    // tsconfig already there.
    fs.writeFileSync(path.join(packageRoot, "tsconfig.json"), "{}\n");

    const result = planSlotPackageBootstrap({
      projectRoot: tmp,
      consumingApps: manifest.apps,
      manifest,
      packageDir: "db",
      packageName: "@acme/db",
      packageRoot,
      consumesPackages: [],
    });
    expect(result.created).toBe(false);
    expect(result.writes).toEqual([]);
  });

  it("skips a consumesPackages peer that isn't a known package dir", () => {
    const { manifest, packageRoot } = setupProject();
    const result = planSlotPackageBootstrap({
      projectRoot: tmp,
      consumingApps: manifest.apps,
      manifest,
      packageDir: "db",
      packageName: "@acme/db",
      packageRoot,
      // "ghost" isn't in PACKAGE_DIRS — should be silently ignored.
      consumesPackages: ["ghost"],
    });
    for (const w of result.writes) w();
    const slotPkg = readJson(path.join(packageRoot, "package.json"));
    expect(slotPkg.dependencies?.["@acme/ghost"]).toBeUndefined();
  });
});

describe("recordFor", () => {
  const baseAdapter = { key: "default", match: {} };
  const seedApp = { id: "web", dir: "apps/web", kind: "web" as const };

  it("emits the minimal shape for a home:repo module", () => {
    const mod: Module = defineModule({
      id: "biome",
      category: "tooling",
      label: "Biome",
      description: "",
      version: "1.0.0",
      adapters: [baseAdapter],
    });
    const record = recordFor(mod, mod.adapters[0]!, [seedApp], undefined);
    expect(record).toEqual({ id: "biome", version: "1.0.0", adapter: "default" });
    expect(record.apps).toBeUndefined();
  });

  it("tags home:app records with targeted apps", () => {
    const mod: Module = defineModule({
      id: "vitest",
      category: "testing",
      label: "Vitest",
      description: "",
      version: "1.0.0",
      adapters: [baseAdapter],
    });
    const record = recordFor(mod, mod.adapters[0]!, [seedApp], undefined);
    expect(record.apps).toEqual(["web"]);
  });

  it("includes the namespace when not the default", () => {
    const mod: Module = defineModule({
      id: "cosmos",
      category: "testing",
      label: "Cosmos",
      description: "",
      version: "1.0.0",
      adapters: [baseAdapter],
    });
    const record = recordFor(mod, mod.adapters[0]!, [seedApp], "@fixture");
    expect(record.namespace).toBe("@fixture");
  });

  it("snapshots codemods so future reverts work even if the registry drifts", () => {
    const mod: Module = defineModule({
      id: "clerk",
      category: "auth",
      label: "Clerk",
      description: "",
      version: "1.0.0",
      adapters: [
        {
          key: "next",
          match: { framework: "next" },
          codemods: [
            {
              id: "wrap-root-layout",
              args: { providerName: "ClerkProvider", providerImport: "@clerk/nextjs" },
            },
          ],
        },
      ],
    });
    const record = recordFor(mod, mod.adapters[0]!, [seedApp], undefined);
    expect(record.codemods).toEqual([
      {
        id: "wrap-root-layout",
        args: { providerName: "ClerkProvider", providerImport: "@clerk/nextjs" },
      },
    ]);
  });

  it("snapshots consumesPackages so render context can rebuild offline", () => {
    const mod: Module = defineModule({
      id: "better-auth",
      category: "auth",
      label: "Better Auth",
      description: "",
      version: "1.0.0",
      consumesPackages: ["db"],
      adapters: [baseAdapter],
    });
    const record = recordFor(mod, mod.adapters[0]!, [seedApp], undefined);
    expect(record.consumesPackages).toEqual(["db"]);
  });

  it("omits codemods/consumesPackages when empty (keep manifests lean)", () => {
    const mod: Module = defineModule({
      id: "drizzle",
      category: "orm",
      label: "Drizzle",
      description: "",
      version: "1.0.0",
      adapters: [baseAdapter],
    });
    const record = recordFor(mod, mod.adapters[0]!, [seedApp], undefined);
    expect(record.codemods).toBeUndefined();
    expect(record.consumesPackages).toBeUndefined();
  });
});
