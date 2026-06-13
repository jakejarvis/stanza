import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { defineModule, type AppSpec, type Module, emptyManifest } from "@withstanza/schema";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  applyModule,
  assertWithinRoot,
  planSlotPackageBootstrap,
  type PlanAction,
  recordFor,
  writeDepKeepingHigher,
} from "./codemod-runner";

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

describe("assertWithinRoot", () => {
  it("accepts a normal relative target, existing or not", () => {
    fs.mkdirSync(path.join(tmp, "apps", "web"), { recursive: true });
    expect(() => assertWithinRoot(tmp, "apps/web", "app dir")).not.toThrow();
    // A not-yet-created tail under a contained parent is fine.
    expect(() => assertWithinRoot(tmp, "apps/web/src/foo.ts", "template dest")).not.toThrow();
    // The root itself is contained.
    expect(() => assertWithinRoot(tmp, ".", "root")).not.toThrow();
  });

  it("rejects a `..` traversal segment", () => {
    expect(() => assertWithinRoot(tmp, "../../etc", "app dir")).toThrow(/escapes the project root/);
    expect(() => assertWithinRoot(tmp, "a/../../b", "app dir")).toThrow(/escapes the project root/);
  });

  it("rejects a symlinked app dir pointing outside the root", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-outside-"));
    try {
      fs.mkdirSync(path.join(tmp, "apps"), { recursive: true });
      fs.symlinkSync(outside, path.join(tmp, "apps", "web"));
      expect(() => assertWithinRoot(tmp, "apps/web", "app dir")).toThrow(
        /escapes the project root/,
      );
      // ...and any write that would land through it.
      expect(() => assertWithinRoot(tmp, "apps/web/src/foo.ts", "template dest")).toThrow(
        /escapes the project root/,
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a dangling symlink pointing outside the root", () => {
    fs.mkdirSync(path.join(tmp, "apps"), { recursive: true });
    // Target doesn't exist — `mkdirSync -p` would otherwise create it outside.
    fs.symlinkSync(path.join(os.tmpdir(), "stanza-ghost-target"), path.join(tmp, "apps", "web"));
    expect(() => assertWithinRoot(tmp, "apps/web/src/foo.ts", "template dest")).toThrow(
      /escapes the project root/,
    );
  });

  it("rejects a two-hop symlink chain that escapes (both hops exist)", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-outside-"));
    try {
      fs.mkdirSync(path.join(tmp, "apps"), { recursive: true });
      fs.mkdirSync(path.join(tmp, "real"), { recursive: true });
      // apps/web -> real/web (lexically in-root) -> outside (escapes). A guard
      // that only checks the first hop's target would miss this.
      fs.symlinkSync(outside, path.join(tmp, "real", "web"));
      fs.symlinkSync(path.join(tmp, "real", "web"), path.join(tmp, "apps", "web"));
      expect(() => assertWithinRoot(tmp, "apps/web/src/foo.ts", "template dest")).toThrow(
        /escapes the project root/,
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a chain whose escape hides in a link target's own path", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-outside-"));
    try {
      fs.mkdirSync(path.join(tmp, "apps"), { recursive: true });
      // real -> outside, then apps/web -> real/web. apps/web's immediate target
      // (`real/web`) is lexically in-root, but `real` itself redirects outside.
      // Leave `outside/web` missing so apps/web is a dangling link.
      fs.symlinkSync(outside, path.join(tmp, "real"));
      fs.symlinkSync(path.join(tmp, "real", "web"), path.join(tmp, "apps", "web"));
      expect(() => assertWithinRoot(tmp, "apps/web/src/foo.ts", "region file key")).toThrow(
        /escapes the project root/,
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("accepts a symlink that stays inside the root", () => {
    fs.mkdirSync(path.join(tmp, "real", "web"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "apps"), { recursive: true });
    fs.symlinkSync(path.join(tmp, "real", "web"), path.join(tmp, "apps", "web"));
    expect(() => assertWithinRoot(tmp, "apps/web/src/foo.ts", "template dest")).not.toThrow();
  });

  it("accepts a dangling in-root symlink (tail not yet created)", () => {
    fs.mkdirSync(path.join(tmp, "real"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "apps"), { recursive: true });
    // apps/web -> real/web, which doesn't exist yet but stays inside the root.
    fs.symlinkSync(path.join(tmp, "real", "web"), path.join(tmp, "apps", "web"));
    expect(() => assertWithinRoot(tmp, "apps/web/src/foo.ts", "template dest")).not.toThrow();
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

// An app-home `testing` module exercising every plan branch: a fresh template
// (create), an over-an-existing template (modify), a new dep (modify), a dep
// the user already pins higher (skip), and a new env var (create).
function probeModule(): Module {
  return defineModule({
    id: "probe",
    category: "testing",
    label: "Probe",
    description: "",
    version: "0.1.0",
    devDependencies: { "left-pad": "^1.0.0" },
    env: [{ name: "PROBE_TOKEN", example: "x", required: false }],
    adapters: [
      {
        key: "default",
        match: {},
        dependencies: { react: "^18.0.0" },
        templates: [
          { src: "new.ts", dest: "probe-new.ts", scope: "app" },
          { src: "existing.ts", dest: "probe-existing.ts", scope: "app" },
        ],
      },
    ],
  });
}

function findAction(plan: PlanAction[], pathSuffix: string, detailNeedle: string): PlanAction {
  const hit = plan.find((a) => a.path.endsWith(pathSuffix) && a.detail.includes(detailNeedle));
  if (!hit) throw new Error(`no plan action for ${pathSuffix} / ${detailNeedle}`);
  return hit;
}

describe("applyModule dry-run plan", () => {
  const webApp: AppSpec = { id: "web", dir: "apps/web", kind: "web" };

  it("classifies create/modify/skip and writes nothing", async () => {
    const projectRoot = tmp;
    const appDir = path.join(projectRoot, "apps/web");
    // Target package.json must exist; the user already pins react higher than
    // the module's declared range, so that dep should be skipped.
    writePkg(appDir, { name: "@app/web", dependencies: { react: "^19.0.0" } });
    // An on-disk template target → the template would overwrite it (modify).
    fs.writeFileSync(path.join(appDir, "probe-existing.ts"), "// user code\n");

    const mod = probeModule();
    const result = await applyModule({
      projectRoot,
      manifest: emptyManifest({ name: "app", apps: [webApp] }),
      module: mod,
      adapter: mod.adapters[0]!,
      targetApps: [webApp],
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(findAction(result.plan, "apps/web/probe-new.ts", "template").op).toBe("create");
    expect(findAction(result.plan, "apps/web/probe-existing.ts", "template").op).toBe("modify");
    expect(findAction(result.plan, "apps/web/package.json", "left-pad").op).toBe("modify");
    const reactSkip = findAction(result.plan, "apps/web/package.json", "react");
    expect(reactSkip.op).toBe("skip");
    expect(reactSkip.reason).toMatch(/newer version/i);
    expect(findAction(result.plan, ".env.example", "PROBE_TOKEN").op).toBe("create");

    // Nothing was written: no manifest, no new template file, no env file, and
    // the user's package.json is untouched (no left-pad, react still ^19).
    expect(fs.existsSync(path.join(projectRoot, "stanza.json"))).toBe(false);
    expect(fs.existsSync(path.join(appDir, "probe-new.ts"))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, ".env.example"))).toBe(false);
    const pkg = readJson(path.join(appDir, "package.json"));
    expect(pkg.dependencies?.react).toBe("^19.0.0");
    expect(pkg.devDependencies?.["left-pad"]).toBeUndefined();
    expect(fs.readFileSync(path.join(appDir, "probe-existing.ts"), "utf8")).toBe("// user code\n");
  });
});
