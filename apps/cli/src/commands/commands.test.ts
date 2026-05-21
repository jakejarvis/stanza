import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cmdAdd } from "./add";
import { cmdInit } from "./init";
import { cmdRemove } from "./remove";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

let tmp: string;
let prevCwd: string;
let prevExitCode: typeof process.exitCode;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-cmd-"));
  prevCwd = process.cwd();
  process.chdir(tmp);
  prevExitCode = process.exitCode;
  process.exitCode = undefined;
  // Point the registry loader at this repo's dev-mode registry so tests
  // exercise the real first-party modules instead of hitting the network.
  process.env.STANZA_REGISTRY = path.join(REPO_ROOT, "registry");
});

afterEach(() => {
  process.chdir(prevCwd);
  process.exitCode = prevExitCode;
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.STANZA_REGISTRY;
});

/**
 * Build the argv shape `mri` produces for `stanza init <name> --yes <flags>`.
 * Kept here (not shared with bin.ts) because the few tests that need it
 * benefit from being explicit about which flags they're passing.
 */
function argv(flags: Record<string, string | boolean>): Record<string, unknown> {
  return { _: [], ...flags };
}

describe("cmdInit --yes", () => {
  it("scaffolds a project with the canonical 5-slot stack", async () => {
    await cmdInit({
      name: "app",
      argv: argv({
        yes: true,
        framework: "next",
        styling: "tailwind",
        db: "postgres",
        orm: "drizzle",
        auth: "better-auth",
      }) as never,
    });
    expect(process.exitCode).toBeFalsy();

    const projectRoot = path.join(tmp, "app");
    expect(fs.existsSync(path.join(projectRoot, "stanza.json"))).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "stanza.json"), "utf8"));
    expect(manifest.modules.framework.id).toBe("next");
    expect(manifest.modules.styling.id).toBe("tailwind");
    expect(manifest.modules.db.id).toBe("postgres");
    expect(manifest.modules.orm.id).toBe("drizzle");
    expect(manifest.modules.auth.id).toBe("better-auth");

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
    await cmdInit({
      name: "minimal",
      argv: argv({ yes: true, framework: "next" }) as never,
    });
    expect(process.exitCode).toBeFalsy();

    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, "minimal", "stanza.json"), "utf8"));
    expect(manifest.modules.framework?.id).toBe("next");
    expect(manifest.modules.styling).toBeUndefined();
    expect(manifest.modules.auth).toBeUndefined();
  });

  it("aborts when a flag references an unknown module id", async () => {
    await cmdInit({
      name: "bad",
      argv: argv({ yes: true, framework: "nonexistent" }) as never,
    });
    // Wizard returns null → cmdInit just returns without writing a project.
    expect(fs.existsSync(path.join(tmp, "bad"))).toBe(false);
  });

  it("respects --pm for package manager", async () => {
    await cmdInit({
      name: "bun-app",
      argv: argv({ yes: true, framework: "next", pm: "bun" }) as never,
    });
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
    await cmdInit({ name: "app", argv: argv({ yes: true, framework: "next" }) as never });
    process.chdir(path.join(tmp, "app"));
  });

  it("adds a module to an existing project", async () => {
    await cmdAdd({ slot: "db", moduleId: "postgres", argv: argv({}) as never });
    expect(process.exitCode).toBeFalsy();

    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.db.id).toBe("postgres");
    expect(fs.existsSync("packages/db/package.json")).toBe(true);
  });

  it("rejects a slot that is already filled", async () => {
    await cmdAdd({ slot: "db", moduleId: "postgres", argv: argv({}) as never });
    process.exitCode = undefined;

    await cmdAdd({ slot: "db", moduleId: "sqlite", argv: argv({}) as never });
    expect(process.exitCode).toBe(1);

    // Manifest still shows postgres.
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.db.id).toBe("postgres");
  });

  it("rejects an unknown slot", async () => {
    await cmdAdd({ slot: "nonsense", moduleId: "x", argv: argv({}) as never });
    expect(process.exitCode).toBe(1);
  });
});

describe("cmdRemove", () => {
  beforeEach(async () => {
    await cmdInit({
      name: "app",
      argv: argv({
        yes: true,
        framework: "next",
        db: "postgres",
        orm: "drizzle",
      }) as never,
    });
    process.chdir(path.join(tmp, "app"));
  });

  it("removes a module and sweeps an emptied slot package", async () => {
    // Drop orm first (orm + db share packages/db/; removing orm alone keeps the package).
    await cmdRemove({ slot: "orm", argv: argv({}) as never });
    expect(process.exitCode).toBeFalsy();

    const afterOrm = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(afterOrm.modules.orm).toBeUndefined();
    expect(afterOrm.modules.db?.id).toBe("postgres");
    // packages/db/ still exists because postgres still owns regions there.
    expect(fs.existsSync("packages/db/package.json")).toBe(true);

    // Now drop db too — packages/db/ should be swept entirely.
    await cmdRemove({ slot: "db", argv: argv({}) as never });
    const afterDb = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(afterDb.modules.db).toBeUndefined();
    expect(fs.existsSync("packages/db")).toBe(false);

    // The host app's workspace dep on @app/db should also be cleaned up.
    const appPkg = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
    expect(appPkg.dependencies?.["@app/db"]).toBeUndefined();
  });

  it("warns and returns when slot is empty", async () => {
    await cmdRemove({ slot: "auth", argv: argv({}) as never });
    expect(process.exitCode).toBeFalsy();
    // Manifest unchanged.
    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.framework.id).toBe("next");
  });

  it("rejects an unknown slot", async () => {
    await cmdRemove({ slot: "nonsense", argv: argv({}) as never });
    expect(process.exitCode).toBe(1);
  });
});

describe("add-ons (multi-choice testing slot)", () => {
  it("init --yes installs two add-ons in one category without a region conflict", async () => {
    await cmdInit({
      name: "app",
      argv: argv({
        yes: true,
        framework: "next",
        testing: "vitest,playwright",
      }) as never,
    });
    expect(process.exitCode).toBeFalsy();

    const projectRoot = path.join(tmp, "app");
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "stanza.json"), "utf8"));
    expect(manifest.addons.testing.map((r: { id: string }) => r.id).toSorted()).toEqual([
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
      await cmdInit({ name: "app", argv: argv({ yes: true, framework: "next" }) as never });
      process.chdir(path.join(tmp, "app"));
    });

    it("accepts a second add-on in a category that already has one", async () => {
      await cmdAdd({ slot: "testing", moduleId: "vitest", argv: argv({}) as never });
      expect(process.exitCode).toBeFalsy();
      await cmdAdd({ slot: "testing", moduleId: "playwright", argv: argv({}) as never });
      expect(process.exitCode).toBeFalsy();

      const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
      expect(manifest.addons.testing.map((r: { id: string }) => r.id).toSorted()).toEqual([
        "playwright",
        "vitest",
      ]);
    });

    it("rejects re-adding the same add-on id", async () => {
      await cmdAdd({ slot: "testing", moduleId: "vitest", argv: argv({}) as never });
      process.exitCode = undefined;
      await cmdAdd({ slot: "testing", moduleId: "vitest", argv: argv({}) as never });
      expect(process.exitCode).toBe(1);
    });

    it("removes only the named add-on, leaving siblings intact", async () => {
      await cmdAdd({ slot: "testing", moduleId: "vitest", argv: argv({}) as never });
      await cmdAdd({ slot: "testing", moduleId: "playwright", argv: argv({}) as never });

      await cmdRemove({ slot: "testing", moduleId: "vitest", argv: argv({}) as never });
      expect(process.exitCode).toBeFalsy();

      const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
      expect(manifest.addons.testing.map((r: { id: string }) => r.id)).toEqual(["playwright"]);
      // vitest's config gone, playwright's remains.
      expect(fs.existsSync("apps/web/vitest.config.ts")).toBe(false);
      expect(fs.existsSync("apps/web/playwright.config.ts")).toBe(true);
      const appPkg = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
      expect(appPkg.scripts.test).toBeUndefined();
      expect(appPkg.scripts["test:e2e"]).toBe("playwright test");

      // Removing the last one drops the category key.
      await cmdRemove({ slot: "testing", moduleId: "playwright", argv: argv({}) as never });
      const after = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
      expect(after.addons.testing).toBeUndefined();
    });

    it("errors when removing an add-on category without an id", async () => {
      await cmdAdd({ slot: "testing", moduleId: "vitest", argv: argv({}) as never });
      process.exitCode = undefined;
      await cmdRemove({ slot: "testing", argv: argv({}) as never });
      expect(process.exitCode).toBe(1);
    });
  });
});
