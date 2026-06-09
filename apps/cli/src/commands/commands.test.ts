import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CATEGORIES, CURRENT_MANIFEST_VERSION } from "@withstanza/schema";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

import { loadRegistries } from "../lib/registry-loader";
import { cmdAdd } from "./add";
import { cmdDoctor } from "./doctor";
import { cmdInit } from "./init";
import { cmdRemove } from "./remove";

let tmp: string;
let prevCwd: string;
let prevExitCode: typeof process.exitCode;

// The CLI only reads built registries (no source-tree loader), so build the
// real first-party registry once into a temp dir and point STANZA_REGISTRY at
// its main file. Hermetic + exercises the production loader.
let fixtureRoot: string;
let fixtureMain: string;

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-reg-"));
  // Build the real first-party registry via the standalone build script — the
  // same entrypoint CI and the web's compile-registry task use — so the test
  // exercises the production build path rather than an in-process import.
  execFileSync(
    path.join(repoRoot, "node_modules/.bin/jiti"),
    ["scripts/compile-registry.ts", fixtureRoot],
    { cwd: repoRoot, stdio: "inherit" },
  );
  fixtureMain = path.join(fixtureRoot, "index.json");
});

afterAll(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-cmd-"));
  prevCwd = process.cwd();
  process.chdir(tmp);
  prevExitCode = process.exitCode;
  process.exitCode = undefined;
  // Full path to the built registry's main file — no directory/base inference.
  process.env.STANZA_REGISTRY = fixtureMain;
  // Keep the apply path hermetic: skip npm version lookups so deps land at the
  // manifest's verbatim ranges and no real network calls happen.
  process.env.STANZA_NO_NPM_LOOKUP = "1";
});

afterEach(() => {
  process.chdir(prevCwd);
  process.exitCode = prevExitCode;
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.STANZA_REGISTRY;
  delete process.env.STANZA_NO_NPM_LOOKUP;
});

// The parsed-args shape citty hands a handler: named args (incl. positionals
// like name/slot/moduleId) plus an empty `_`.
function args(flags: Record<string, string | boolean> = {}): Record<string, unknown> & {
  _: (string | number)[];
} {
  return { _: [], ...flags };
}

describe("cmdInit --yes", () => {
  it("scaffolds a project with the canonical 5-slot stack", async () => {
    await cmdInit(
      args({
        name: "app",
        yes: true,
        framework: "next",
        ui: "tailwind",
        db: "postgres",
        orm: "drizzle",
        auth: "better-auth",
      }),
    );
    expect(process.exitCode).toBeFalsy();

    const projectRoot = path.join(tmp, "app");
    expect(fs.existsSync(path.join(projectRoot, "stanza.json"))).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "stanza.json"), "utf8"));
    expect(manifest.modules.framework[0].id).toBe("next");
    expect(manifest.modules.ui[0].id).toBe("tailwind");
    expect(manifest.modules.db[0].id).toBe("postgres");
    expect(manifest.modules.orm[0].id).toBe("drizzle");
    expect(manifest.modules.auth[0].id).toBe("better-auth");

    // Slot-package extraction wired both auth and db packages.
    expect(fs.existsSync(path.join(projectRoot, "packages/auth/package.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "packages/db/package.json"))).toBe(true);

    // Cross-package wiring: auth consumes db via workspace:*.
    const authPkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "packages/auth/package.json"), "utf8"),
    );
    expect(authPkg.dependencies["@app/db"]).toBe("workspace:*");
  });

  it("skips slots not provided as flags", async () => {
    await cmdInit(args({ name: "minimal", yes: true, framework: "next" }));
    expect(process.exitCode).toBeFalsy();

    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, "minimal", "stanza.json"), "utf8"));
    expect(manifest.modules.framework?.[0]?.id).toBe("next");
    expect(manifest.modules.ui).toBeUndefined();
    expect(manifest.modules.auth).toBeUndefined();
  });

  it("aborts when a flag references an unknown module id", async () => {
    await cmdInit(args({ name: "bad", yes: true, framework: "nonexistent" }));
    // Wizard returns null → cmdInit just returns without writing a project.
    expect(fs.existsSync(path.join(tmp, "bad"))).toBe(false);
  });

  it("respects --pm for package manager", async () => {
    await cmdInit(args({ name: "bun-app", yes: true, framework: "next", pm: "bun" }));
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, "bun-app", "stanza.json"), "utf8"));
    expect(manifest.packageManager).toBe("bun");
    const rootPkg = JSON.parse(fs.readFileSync(path.join(tmp, "bun-app", "package.json"), "utf8"));
    // Bun reads workspaces from package.json, not pnpm-workspace.yaml.
    expect(rootPkg.workspaces).toEqual(["apps/*", "packages/*"]);
    expect(fs.existsSync(path.join(tmp, "bun-app", "pnpm-workspace.yaml"))).toBe(false);
  });
});

describe("cmdAdd", () => {
  beforeEach(async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    process.chdir(path.join(tmp, "app"));
  });

  it("adds a module to an existing project", async () => {
    await cmdAdd(args({ slot: "db", moduleId: "postgres" }));
    expect(process.exitCode).toBeFalsy();

    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.db[0].id).toBe("postgres");
    expect(fs.existsSync("packages/db/package.json")).toBe(true);
  });

  it("rejects a slot that is already filled", async () => {
    await cmdAdd(args({ slot: "db", moduleId: "postgres" }));
    process.exitCode = undefined;

    await cmdAdd(args({ slot: "db", moduleId: "sqlite" }));
    expect(process.exitCode).toBe(1);

    // Manifest still shows postgres.
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.db[0].id).toBe("postgres");
  });

  it("rejects an unknown slot", async () => {
    await cmdAdd(args({ slot: "nonsense", moduleId: "x" }));
    expect(process.exitCode).toBe(1);
  });

  it("rejects an unknown --app target", async () => {
    await cmdAdd(args({ slot: "db", moduleId: "postgres", app: "nope" }));
    expect(process.exitCode).toBe(1);
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.db).toBeUndefined();
  });

  it("surfaces a field-path error for a malformed stanza.json", async () => {
    const m = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    m.apps = "not-an-array"; // schema expects an array of app specs
    fs.writeFileSync("stanza.json", JSON.stringify(m, null, 2));
    await expect(cmdAdd(args({ slot: "db", moduleId: "postgres" }))).rejects.toThrow(
      /Malformed stanza\.json[\s\S]*apps/,
    );
  });
});

describe("cmdRemove", () => {
  beforeEach(async () => {
    await cmdInit(
      args({ name: "app", yes: true, framework: "next", db: "postgres", orm: "drizzle" }),
    );
    process.chdir(path.join(tmp, "app"));
  });

  it("removes a module and sweeps an emptied slot package", async () => {
    // Drop orm first (orm + db share packages/db/; removing orm alone keeps the package).
    await cmdRemove(args({ slot: "orm" }));
    expect(process.exitCode).toBeFalsy();

    const afterOrm = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(afterOrm.modules.orm).toBeUndefined();
    expect(afterOrm.modules.db?.[0]?.id).toBe("postgres");
    // packages/db/ still exists because postgres still owns regions there.
    expect(fs.existsSync("packages/db/package.json")).toBe(true);

    // Now drop db too — packages/db/ should be swept entirely.
    await cmdRemove(args({ slot: "db" }));
    const afterDb = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(afterDb.modules.db).toBeUndefined();
    expect(fs.existsSync("packages/db")).toBe(false);

    // The host app's workspace dep on @app/db should also be cleaned up.
    const appPkg = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
    expect(appPkg.dependencies?.["@app/db"]).toBeUndefined();
  });

  it("warns and returns when slot is empty", async () => {
    await cmdRemove(args({ slot: "auth" }));
    expect(process.exitCode).toBeFalsy();
    // Manifest unchanged.
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.framework[0].id).toBe("next");
  });

  it("rejects an unknown slot", async () => {
    await cmdRemove(args({ slot: "nonsense" }));
    expect(process.exitCode).toBe(1);
  });

  it("refuses to sweep a slot package that's still consumed via consumesPackages", async () => {
    // better-auth declares `consumesPackages: ["db"]`.
    await cmdAdd(args({ slot: "auth", moduleId: "better-auth" }));
    expect(process.exitCode).toBeFalsy();

    await cmdRemove(args({ slot: "orm" }));
    await cmdRemove(args({ slot: "db" }));
    expect(process.exitCode).toBeFalsy();

    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.db).toBeUndefined();
    expect(manifest.modules.orm).toBeUndefined();
    expect(manifest.modules.auth[0].id).toBe("better-auth");

    expect(fs.existsSync("packages/db/package.json")).toBe(true);
    const appPkg = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
    expect(appPkg.dependencies?.["@app/db"]).toBe("workspace:*");

    // Removing auth releases the protection — next sweep runs clean.
    await cmdRemove(args({ slot: "auth" }));
    expect(fs.existsSync("packages/db")).toBe(false);
  });

  it("refuses to sweep a slot package that contains user-authored files", async () => {
    fs.writeFileSync("packages/db/.env.local", "USER_SECRET=hunter2\n");
    fs.mkdirSync("packages/db/scratch", { recursive: true });
    fs.writeFileSync("packages/db/scratch/notes.md", "# my notes\n");

    await cmdRemove(args({ slot: "orm" }));
    await cmdRemove(args({ slot: "db" }));
    expect(process.exitCode).toBeFalsy();

    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.db).toBeUndefined();
    expect(manifest.modules.orm).toBeUndefined();
    expect(fs.existsSync("packages/db")).toBe(true);
    expect(fs.readFileSync("packages/db/.env.local", "utf8")).toContain("USER_SECRET=hunter2");
    expect(fs.existsSync("packages/db/scratch/notes.md")).toBe(true);
  });
});

describe("cmdRemove path-traversal hardening", () => {
  it("refuses to delete through a symlinked region path that escapes the root", async () => {
    const projectRoot = path.join(tmp, "proj");
    fs.mkdirSync(path.join(projectRoot, "apps"), { recursive: true });

    // A sentinel that lives OUTSIDE the project root.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-outside-"));
    const sentinel = path.join(outside, "evil.ts");
    fs.writeFileSync(sentinel, "// attacker-controlled\n");
    // `apps/web` is a symlink at the outside dir, so the lexically-valid region
    // key `apps/web/evil.ts` resolves to the sentinel only once the link is
    // followed — the schema can't catch this, but the delete sink must.
    fs.symlinkSync(outside, path.join(projectRoot, "apps", "web"));

    const manifest = {
      version: CURRENT_MANIFEST_VERSION,
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "proj",
      // `ghost` isn't in the registry, so revert is skipped and we fall through
      // to the declarative delete loop where the symlink guard fires.
      modules: {
        framework: [{ id: "ghost", version: "0.0.0", adapter: "default", apps: ["web"] }],
      },
      apps: [{ id: "web", dir: "apps/web", kind: "web" }],
      regions: { "apps/web/evil.ts": { file: "ghost@web" } },
    };
    fs.writeFileSync(path.join(projectRoot, "stanza.json"), JSON.stringify(manifest, null, 2));

    try {
      process.chdir(projectRoot);
      await expect(cmdRemove(args({ slot: "framework" }))).rejects.toThrow(
        /escapes the project root/,
      );
      // The file outside the root must be untouched.
      expect(fs.existsSync(sentinel)).toBe(true);
    } finally {
      process.chdir(tmp);
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("cmdRemove legacy bare-owner claims", () => {
  it("does not sweep a sibling app's claims when the same module is installed elsewhere", async () => {
    const projectRoot = path.join(tmp, "proj");
    fs.mkdirSync(path.join(projectRoot, "apps", "web"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "apps", "native"), { recursive: true });

    const webFile = path.join(projectRoot, "apps/web/ghost.config.ts");
    const nativeFile = path.join(projectRoot, "apps/native/ghost.config.ts");
    fs.writeFileSync(webFile, "// web install\n");
    fs.writeFileSync(nativeFile, "// native install\n");

    // Pre-composite-owner manifest: both installs' claims use the bare module
    // id, so neither claim can be attributed to a single app. `ghost` isn't in
    // the registry, mirroring the offline/renamed-upstream scenario.
    const manifest = {
      version: CURRENT_MANIFEST_VERSION,
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "proj",
      modules: {
        testing: [
          { id: "ghost", version: "0.0.0", adapter: "default", apps: ["web"] },
          { id: "ghost", version: "0.0.0", adapter: "default", apps: ["native"] },
        ],
      },
      apps: [
        { id: "web", dir: "apps/web", kind: "web" },
        { id: "native", dir: "apps/native", kind: "native" },
      ],
      regions: {
        "apps/web/ghost.config.ts": { file: "ghost" },
        "apps/native/ghost.config.ts": { file: "ghost" },
      },
    };
    fs.writeFileSync(path.join(projectRoot, "stanza.json"), JSON.stringify(manifest, null, 2));

    process.chdir(projectRoot);
    await cmdRemove(args({ slot: "testing", moduleId: "ghost", app: "web" }));
    process.chdir(tmp);

    // The sibling install's file (and even web's own, since the bare claims
    // can't be attributed) must survive; only the web record is dropped.
    expect(fs.existsSync(nativeFile)).toBe(true);
    const after = JSON.parse(fs.readFileSync(path.join(projectRoot, "stanza.json"), "utf8"));
    expect(after.modules.testing).toEqual([
      { id: "ghost", version: "0.0.0", adapter: "default", apps: ["native"] },
    ]);

    // Removing the last record (no sibling left) applies the bare-id fallback
    // and sweeps the legacy claims.
    process.chdir(projectRoot);
    await cmdRemove(args({ slot: "testing", moduleId: "ghost", app: "native" }));
    process.chdir(tmp);
    expect(fs.existsSync(nativeFile)).toBe(false);
    const final = JSON.parse(fs.readFileSync(path.join(projectRoot, "stanza.json"), "utf8"));
    expect(final.modules.testing).toBeUndefined();
    expect(final.regions).toEqual({});
  });
});

describe("add-ons (multi-choice testing slot)", () => {
  it("init --yes installs two add-ons in one category without a region conflict", async () => {
    await cmdInit(
      args({ name: "app", yes: true, framework: "next", testing: "vitest,playwright" }),
    );
    expect(process.exitCode).toBeFalsy();

    const projectRoot = path.join(tmp, "app");
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "stanza.json"), "utf8"));
    expect(manifest.modules.testing.map((r: { id: string }) => r.id).toSorted()).toEqual([
      "playwright",
      "vitest",
    ]);

    // Both config files landed.
    expect(fs.existsSync(path.join(projectRoot, "apps/web/vitest.config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "apps/web/playwright.config.ts"))).toBe(true);

    // Disjoint scripts coexist on the app package.json (no RegionConflictError).
    const appPkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "apps/web/package.json"), "utf8"),
    );
    expect(appPkg.scripts.test).toBe("vitest run");
    expect(appPkg.scripts["test:e2e"]).toBe("playwright test");
    expect(appPkg.devDependencies.vitest).toBeTruthy();
    expect(appPkg.devDependencies["@playwright/test"]).toBeTruthy();
  });

  describe("add / remove", () => {
    beforeEach(async () => {
      await cmdInit(args({ name: "app", yes: true, framework: "next" }));
      process.chdir(path.join(tmp, "app"));
    });

    it("accepts a second add-on in a category that already has one", async () => {
      await cmdAdd(args({ slot: "testing", moduleId: "vitest" }));
      expect(process.exitCode).toBeFalsy();
      await cmdAdd(args({ slot: "testing", moduleId: "playwright" }));
      expect(process.exitCode).toBeFalsy();

      const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
      expect(manifest.modules.testing.map((r: { id: string }) => r.id).toSorted()).toEqual([
        "playwright",
        "vitest",
      ]);
    });

    it("rejects re-adding the same add-on id", async () => {
      await cmdAdd(args({ slot: "testing", moduleId: "vitest" }));
      process.exitCode = undefined;
      await cmdAdd(args({ slot: "testing", moduleId: "vitest" }));
      expect(process.exitCode).toBe(1);
    });

    it("removes only the named add-on, leaving siblings intact", async () => {
      await cmdAdd(args({ slot: "testing", moduleId: "vitest" }));
      await cmdAdd(args({ slot: "testing", moduleId: "playwright" }));

      await cmdRemove(args({ slot: "testing", moduleId: "vitest" }));
      expect(process.exitCode).toBeFalsy();

      const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
      expect(manifest.modules.testing.map((r: { id: string }) => r.id)).toEqual(["playwright"]);
      // vitest's config gone, playwright's remains.
      expect(fs.existsSync("apps/web/vitest.config.ts")).toBe(false);
      expect(fs.existsSync("apps/web/playwright.config.ts")).toBe(true);
      const appPkg = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
      expect(appPkg.scripts.test).toBeUndefined();
      expect(appPkg.scripts["test:e2e"]).toBe("playwright test");

      // Removing the last one drops the category key.
      await cmdRemove(args({ slot: "testing", moduleId: "playwright" }));
      const after = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
      expect(after.modules.testing).toBeUndefined();
    });

    it("errors when removing an add-on category without an id", async () => {
      await cmdAdd(args({ slot: "testing", moduleId: "vitest" }));
      process.exitCode = undefined;
      await cmdRemove(args({ slot: "testing" }));
      expect(process.exitCode).toBe(1);
    });
  });
});

describe("tooling slot (single-choice, repo-scoped)", () => {
  it("init --yes installs a tooling pick at the repo root", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next", tooling: "eslint-prettier" }));
    expect(process.exitCode).toBeFalsy();

    const projectRoot = path.join(tmp, "app");
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "stanza.json"), "utf8"));
    expect(manifest.modules.tooling?.[0]).toMatchObject({ id: "eslint-prettier", adapter: "next" });

    // Repo-scoped: config + scripts + devDeps land at the monorepo root, not the app.
    expect(fs.existsSync(path.join(projectRoot, "eslint.config.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "prettier.config.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "apps/web/eslint.config.mjs"))).toBe(false);

    const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    // framework-next no longer ships `lint`, so the tooling module owns it cleanly.
    expect(rootPkg.scripts.lint).toBe("eslint .");
    expect(rootPkg.scripts.format).toBe("prettier --write .");
    expect(rootPkg.devDependencies.eslint).toBeTruthy();

    // The app package.json is untouched by the tooling slot.
    const appPkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "apps/web/package.json"), "utf8"),
    );
    expect(appPkg.scripts?.lint).toBeUndefined();
  });

  it("framework-next ships no lint script on its own", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    const appPkg = JSON.parse(
      fs.readFileSync(path.join(tmp, "app", "apps/web/package.json"), "utf8"),
    );
    expect(appPkg.scripts.lint).toBeUndefined();
  });

  it("add installs a framework-agnostic tooling module at the root", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "tanstack-start" }));
    process.chdir(path.join(tmp, "app"));

    await cmdAdd(args({ slot: "tooling", moduleId: "biome" }));
    expect(process.exitCode).toBeFalsy();

    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.tooling?.[0]).toMatchObject({ id: "biome", adapter: "default" });
    expect(fs.existsSync("biome.json")).toBe(true);
    const rootPkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(rootPkg.scripts.lint).toBe("biome lint .");
    expect(rootPkg.devDependencies["@biomejs/biome"]).toBeTruthy();
  });

  it("rejects a second tooling pick (slot already filled)", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next", tooling: "biome" }));
    process.chdir(path.join(tmp, "app"));
    process.exitCode = undefined;

    await cmdAdd(args({ slot: "tooling", moduleId: "oxlint-oxfmt" }));
    expect(process.exitCode).toBe(1);

    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.tooling[0].id).toBe("biome");
  });
});

describe("tooling-eslint-prettier — framework-conditional rendering", () => {
  it("installs without a framework via the default adapter (pure-TS config)", async () => {
    await cmdInit(args({ name: "app", yes: true, tooling: "eslint-prettier" }));
    expect(process.exitCode).toBeFalsy();

    const projectRoot = path.join(tmp, "app");
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "stanza.json"), "utf8"));
    expect(manifest.modules.tooling?.[0]).toMatchObject({
      id: "eslint-prettier",
      adapter: "default",
    });

    const config = fs.readFileSync(path.join(projectRoot, "eslint.config.mjs"), "utf8");
    // Framework-specific blocks must be absent.
    expect(config).not.toContain("@next/eslint-plugin-next");
    expect(config).not.toContain("eslint-plugin-react");
    expect(config).not.toContain("core-web-vitals");
    expect(config).not.toContain(".next");
    expect(config).not.toContain("routeTree.gen.ts");
    // Pure-TS base is still present.
    expect(config).toContain('import tseslint from "typescript-eslint";');
    expect(config).toContain('import prettier from "eslint-config-prettier";');

    const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    expect(rootPkg.devDependencies.eslint).toBeTruthy();
    expect(rootPkg.devDependencies["@next/eslint-plugin-next"]).toBeUndefined();
    expect(rootPkg.devDependencies["eslint-plugin-react"]).toBeUndefined();
    expect(rootPkg.devDependencies["eslint-plugin-react-hooks"]).toBeUndefined();
  });

  it("layers Next-specific plugins when framework=next", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next", tooling: "eslint-prettier" }));
    expect(process.exitCode).toBeFalsy();

    const projectRoot = path.join(tmp, "app");
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "stanza.json"), "utf8"));
    expect(manifest.modules.tooling?.[0]).toMatchObject({
      id: "eslint-prettier",
      adapter: "next",
    });

    const config = fs.readFileSync(path.join(projectRoot, "eslint.config.mjs"), "utf8");
    expect(config).toContain('import next from "@next/eslint-plugin-next";');
    expect(config).toContain("core-web-vitals");
    expect(config).toContain("**/.next/**");
    // TanStack-specific bits must not leak in.
    expect(config).not.toContain('import react from "eslint-plugin-react";');
    expect(config).not.toContain("routeTree.gen.ts");

    const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    expect(rootPkg.devDependencies["@next/eslint-plugin-next"]).toBeTruthy();
    expect(rootPkg.devDependencies["eslint-plugin-react-hooks"]).toBeTruthy();
    expect(rootPkg.devDependencies["eslint-plugin-react"]).toBeUndefined();
  });

  it("layers TanStack-specific plugins when framework=tanstack-start", async () => {
    await cmdInit(
      args({
        name: "app",
        yes: true,
        framework: "tanstack-start",
        tooling: "eslint-prettier",
      }),
    );
    expect(process.exitCode).toBeFalsy();

    const projectRoot = path.join(tmp, "app");
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "stanza.json"), "utf8"));
    expect(manifest.modules.tooling?.[0]).toMatchObject({
      id: "eslint-prettier",
      adapter: "tanstack-start",
    });

    const config = fs.readFileSync(path.join(projectRoot, "eslint.config.mjs"), "utf8");
    expect(config).toContain('import react from "eslint-plugin-react";');
    expect(config).toContain("routeTree.gen.ts");
    expect(config).toContain("react/react-in-jsx-scope");
    // Next-specific bits must not leak in.
    expect(config).not.toContain("@next/eslint-plugin-next");
    expect(config).not.toContain("core-web-vitals");

    const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    expect(rootPkg.devDependencies["eslint-plugin-react"]).toBeTruthy();
    expect(rootPkg.devDependencies["eslint-plugin-react-hooks"]).toBeTruthy();
    expect(rootPkg.devDependencies["@next/eslint-plugin-next"]).toBeUndefined();
  });
});

// Minimal, schema-valid module fixture for the third-party registry tests.
// Multi-cardinality `testing` category so it never collides with first-party
// single-choice slots, and no peer constraints so it installs against any
// framework (or none).
function cosmosModule(extra: Record<string, unknown> = {}) {
  return {
    category: "testing",
    id: "cosmos",
    label: "Cosmos",
    description: "Component sandbox.",
    version: "1.0.0",
    devDependencies: { "react-cosmos": "^7.0.0" },
    scripts: { cosmos: "cosmos" },
    adapters: [{ key: "default", match: {} }],
    ...extra,
  };
}

describe("third-party registries", () => {
  // Spin up a stub HTTP registry per test so we can verify namespace-aware
  // module resolution, header auth, and codemod-catalog enforcement end-to-end.
  // Modules are hand-crafted JSON; the registry build pipeline isn't involved.
  type Fixture = {
    modules: Record<string, unknown>;
    onRequest?: (req: {
      url: string;
      headers: Record<string, string | string[] | undefined>;
    }) => void;
  };
  let server: Server;
  let baseUrl: string;
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = { modules: {} };
    server = createServer((req, res) => {
      const url = req.url ?? "";
      fixture.onRequest?.({ url, headers: req.headers });
      const sendJson = (payload: unknown) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(payload));
      };
      // The main file: an index listing every fixture module, each carrying its
      // `path`. Adapters are stripped to `key`+`match` (index metadata shape).
      if (url === "/index.json" || url.startsWith("/index.json?")) {
        const modules = Object.entries(fixture.modules).map(([key, mod]) => {
          const m = mod as Record<string, unknown> & {
            adapters?: Array<{ key: string; match: unknown }>;
          };
          return Object.assign({}, m, {
            adapters: (m.adapters ?? []).map((a) => ({ key: a.key, match: a.match })),
            path: `${key}.json`,
          });
        });
        sendJson({ generatedAt: "t", schemaVersion: 2, categories: [...CATEGORIES], modules });
        return;
      }
      // Per-module full manifests at the flat `path` advertised by the index.
      const match = /^\/([^/?]+)\.json/.exec(url);
      const payload = match ? fixture.modules[match[1]!] : undefined;
      if (!payload) {
        res.statusCode = 404;
        res.end();
        return;
      }
      sendJson(payload);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("installs a module from a third-party namespace and records its origin", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    process.chdir(path.join(tmp, "app"));
    writeStanza(process.cwd(), { "@fixture": `${baseUrl}/index.json` });
    fixture.modules["testing-cosmos"] = cosmosModule();

    await cmdAdd(args({ slot: "testing", moduleId: "@fixture/cosmos" }));
    expect(process.exitCode).toBeFalsy();

    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.testing).toHaveLength(1);
    expect(manifest.modules.testing[0]).toMatchObject({
      id: "cosmos",
      namespace: "@fixture",
    });
    // The devDep + script landed on the app's package.json.
    const appPkg = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
    expect(appPkg.devDependencies["react-cosmos"]).toBe("^7.0.0");
    expect(appPkg.scripts.cosmos).toBe("cosmos");
  });

  it("rejects an unknown namespace with a clear error", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    process.chdir(path.join(tmp, "app"));
    // No `registries` field at all — `@nope` is undeclared.
    await cmdAdd(args({ slot: "testing", moduleId: "@nope/cosmos" }));
    expect(process.exitCode).toBe(1);
    // Manifest unchanged.
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.testing).toBeUndefined();
  });

  it("refetches from the original namespace on remove", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    process.chdir(path.join(tmp, "app"));
    writeStanza(process.cwd(), { "@fixture": `${baseUrl}/index.json` });
    fixture.modules["testing-cosmos"] = cosmosModule();

    await cmdAdd(args({ slot: "testing", moduleId: "@fixture/cosmos" }));

    // Track requests during the remove so we can assert the namespace was honored.
    const requests: string[] = [];
    fixture.onRequest = ({ url }) => requests.push(url);

    await cmdRemove(args({ slot: "testing", moduleId: "@fixture/cosmos" }));
    expect(process.exitCode).toBeFalsy();
    expect(requests).toContain("/testing-cosmos.json");

    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.testing).toBeUndefined();
    const appPkg = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
    expect(appPkg.devDependencies?.["react-cosmos"]).toBeUndefined();
    expect(appPkg.scripts?.cosmos).toBeUndefined();
  });

  it("expands ${ENV_VAR} tokens in headers and drops the header when unset", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    process.chdir(path.join(tmp, "app"));
    writeStanza(process.cwd(), {
      "@fixture": {
        url: `${baseUrl}/index.json`,
        headers: {
          Authorization: "Bearer ${STANZA_TEST_TOKEN}",
          "X-Missing": "Bearer ${STANZA_UNSET_TOKEN}",
        },
      },
    });
    fixture.modules["testing-cosmos"] = cosmosModule();

    let captured: Record<string, string | string[] | undefined> | undefined;
    fixture.onRequest = ({ url, headers }) => {
      if (url === "/testing-cosmos.json") captured = headers;
    };

    process.env.STANZA_TEST_TOKEN = "secret-xyz";
    try {
      await cmdAdd(args({ slot: "testing", moduleId: "@fixture/cosmos" }));
    } finally {
      delete process.env.STANZA_TEST_TOKEN;
    }
    expect(process.exitCode).toBeFalsy();
    expect(captured?.authorization).toBe("Bearer secret-xyz");
    // Headers whose template references an unset env var are dropped silently.
    expect(captured?.["x-missing"]).toBeUndefined();
  });

  it("rejects a third-party module that invokes an unknown codemod", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    process.chdir(path.join(tmp, "app"));
    writeStanza(process.cwd(), { "@fixture": `${baseUrl}/index.json` });
    fixture.modules["testing-cosmos"] = cosmosModule({
      adapters: [{ key: "default", match: {}, codemods: [{ id: "not-a-real-codemod" }] }],
    });

    // The runner validates codemod ids against the first-party catalog up
    // front (before any files change); cmdAdd surfaces it as a handled failure
    // with recovery guidance rather than a raw stack.
    await cmdAdd(args({ slot: "testing", moduleId: "@fixture/cosmos" }));
    expect(process.exitCode).toBe(1);

    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.testing).toBeUndefined();
  });

  it("surfaces a clear error when the registry's main file lists no such module", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    process.chdir(path.join(tmp, "app"));
    writeStanza(process.cwd(), { "@fixture": `${baseUrl}/index.json` });
    // fixture.modules is empty → the main file lists nothing, so `ghost` isn't
    // in the index and resolution fails cleanly.
    await cmdAdd(args({ slot: "testing", moduleId: "@fixture/ghost" }));
    expect(process.exitCode).toBe(1);
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.testing).toBeUndefined();
  });

  it("skips a namespace whose main file is unreachable", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    process.chdir(path.join(tmp, "app"));
    // Points at a path the stub 404s — the namespace fails to initialize and is
    // skipped, so the module id resolves to an unknown registry.
    writeStanza(process.cwd(), { "@fixture": `${baseUrl}/nope.json` });
    fixture.modules["testing-cosmos"] = cosmosModule();
    await cmdAdd(args({ slot: "testing", moduleId: "@fixture/cosmos" }));
    expect(process.exitCode).toBe(1);
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.testing).toBeUndefined();
  });

  it("rolls back template writes when a codemod throws mid-apply", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    process.chdir(path.join(tmp, "app"));
    writeStanza(process.cwd(), { "@fixture": `${baseUrl}/index.json` });
    // A module that writes a template, then runs `append-to-file` against a
    // file that doesn't exist — a real catalog codemod that throws at runtime,
    // AFTER the template has been flushed to disk.
    fixture.modules["testing-probe"] = {
      category: "testing",
      id: "probe",
      label: "Probe",
      description: "rollback probe",
      version: "1.0.0",
      adapters: [
        {
          key: "default",
          match: {},
          templates: [
            { src: "p.txt", dest: "rollback-probe.txt", scope: "app", content: "probe\n" },
          ],
          codemods: [
            {
              id: "append-to-file",
              args: { file: "nope.txt", content: "boom", marker: "m", commentStyle: "line" },
            },
          ],
        },
      ],
    };

    await cmdAdd(args({ slot: "testing", moduleId: "@fixture/probe" }));
    expect(process.exitCode).toBe(1);

    // Rollback removed the flushed template and restored the manifest.
    expect(fs.existsSync("apps/web/rollback-probe.txt")).toBe(false);
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.testing).toBeUndefined();
  });

  it("surfaces a region conflict cleanly and writes nothing", async () => {
    await cmdInit(args({ name: "app", yes: true, framework: "next" }));
    process.chdir(path.join(tmp, "app"));
    writeStanza(process.cwd(), { "@fixture": `${baseUrl}/index.json` });
    // First-party vitest claims `scripts.test` on the app's package.json.
    await cmdAdd(args({ slot: "testing", moduleId: "vitest" }));
    expect(process.exitCode).toBeFalsy();
    const before = fs.readFileSync("apps/web/package.json", "utf8");

    // A fixture add-on that also wants `scripts.test` → claim conflict. Region
    // claims are staged in memory before any flush, so the throw lands before a
    // single byte is written.
    fixture.modules["testing-cosmos"] = cosmosModule({ scripts: { test: "cosmos run" } });
    process.exitCode = undefined;
    await cmdAdd(args({ slot: "testing", moduleId: "@fixture/cosmos" }));
    expect(process.exitCode).toBe(1);

    expect(fs.readFileSync("apps/web/package.json", "utf8")).toBe(before);
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.testing.map((r: { id: string }) => r.id)).toEqual(["vitest"]);
  });
});

describe("filesystem main-file registry", () => {
  // STANZA_REGISTRY is the full path to the main JSON file; module `path`s in it
  // resolve relative to the file. No directory or filename inference.
  it("loads the index and modules from a main-file URI", async () => {
    const root = path.join(tmp, "reg");
    fs.mkdirSync(root, { recursive: true });
    const cosmos = cosmosModule();
    const mainFile = path.join(root, "main.json"); // any filename works
    fs.writeFileSync(
      mainFile,
      JSON.stringify({
        generatedAt: "2026-01-01T00:00:00.000Z",
        schemaVersion: 2,
        categories: [...CATEGORIES],
        modules: [
          {
            ...cosmos,
            adapters: cosmos.adapters.map((a) => ({ key: a.key, match: a.match })),
            path: "testing-cosmos.json",
          },
        ],
      }),
    );
    fs.writeFileSync(path.join(root, "testing-cosmos.json"), JSON.stringify(cosmos));
    process.env.STANZA_REGISTRY = mainFile;

    const registry = await loadRegistries();
    expect(registry.defaultIndex().modules.map((m) => m.id)).toContain("cosmos");
    expect(registry.defaultIndex().categories.map((c) => c.id)).toContain("api");
    // Full module resolves via the entry's `path`, with install fields intact.
    const mod = await registry.loadModule("testing", "cosmos");
    expect(mod.id).toBe("cosmos");
    expect(mod.devDependencies?.["react-cosmos"]).toBe("^7.0.0");
    // A module absent from the main file surfaces a clear error.
    await expect(registry.loadModule("testing", "ghost")).rejects.toThrow(/not found in registry/);
  });

  it("errors clearly when STANZA_REGISTRY points at a directory", async () => {
    // The built fixture's `registry/` dir is a directory, not the main file.
    process.env.STANZA_REGISTRY = path.dirname(fixtureMain);
    await expect(loadRegistries()).rejects.toThrow(
      /full path\/URL to the registry's main JSON file/,
    );
  });
});

describe("cmdDoctor", () => {
  beforeEach(async () => {
    await cmdInit(
      args({ name: "app", yes: true, framework: "next", db: "postgres", orm: "drizzle" }),
    );
    process.chdir(path.join(tmp, "app"));
  });

  it("reports no drift for a freshly generated project", async () => {
    await cmdDoctor();
    expect(process.exitCode).toBeFalsy();
  });

  it("flags a claimed file that was deleted", async () => {
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    const fileClaim = Object.entries(manifest.regions).find(
      ([, regions]) => (regions as Record<string, string>).file,
    );
    expect(fileClaim).toBeTruthy();
    fs.rmSync(fileClaim![0]); // delete the claimed file (paths are project-relative)

    process.exitCode = undefined;
    await cmdDoctor();
    expect(process.exitCode).toBe(1);
  });

  it("flags a claimed dependency that was stripped", async () => {
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    let target: { file: string; kind: string; name: string } | undefined;
    for (const [file, regions] of Object.entries(manifest.regions)) {
      for (const region of Object.keys(regions as Record<string, string>)) {
        const s = region.startsWith("app.") ? region.slice("app.".length) : region;
        if (s.startsWith("dependencies.") || s.startsWith("devDependencies.")) {
          const [kind, ...rest] = s.split(".");
          target = { file, kind: kind!, name: rest.join(".") };
          break;
        }
      }
      if (target) break;
    }
    expect(target).toBeTruthy();
    const pkg = JSON.parse(fs.readFileSync(target!.file, "utf8"));
    delete pkg[target!.kind][target!.name];
    fs.writeFileSync(target!.file, JSON.stringify(pkg, null, 2));

    process.exitCode = undefined;
    await cmdDoctor();
    expect(process.exitCode).toBe(1);
  });
});

function writeStanza(projectRoot: string, registries: Record<string, unknown>) {
  const file = path.join(projectRoot, "stanza.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.registries = registries;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
}
