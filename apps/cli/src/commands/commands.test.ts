import fs from "node:fs";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

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
      // Map `/modules/<category>-<id>.json` → fixture.modules[<category>-<id>].
      // `/index.json` is intentionally 404 — we exercise fetch-by-name only.
      const match = /^\/modules\/(.+)\.json$/.exec(url);
      if (!match) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const payload = fixture.modules[match[1]!];
      if (!payload) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(payload));
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
    writeStanza(process.cwd(), { "@fixture": baseUrl });
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
    writeStanza(process.cwd(), { "@fixture": baseUrl });
    fixture.modules["testing-cosmos"] = cosmosModule();

    await cmdAdd(args({ slot: "testing", moduleId: "@fixture/cosmos" }));

    // Track requests during the remove so we can assert the namespace was honored.
    const requests: string[] = [];
    fixture.onRequest = ({ url }) => requests.push(url);

    await cmdRemove(args({ slot: "testing", moduleId: "@fixture/cosmos" }));
    expect(process.exitCode).toBeFalsy();
    expect(requests).toContain("/modules/testing-cosmos.json");

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
        url: `${baseUrl}/modules/{category}-{id}.json`,
        headers: {
          Authorization: "Bearer ${STANZA_TEST_TOKEN}",
          "X-Missing": "Bearer ${STANZA_UNSET_TOKEN}",
        },
      },
    });
    fixture.modules["testing-cosmos"] = cosmosModule();

    let captured: Record<string, string | string[] | undefined> | undefined;
    fixture.onRequest = ({ url, headers }) => {
      if (url === "/modules/testing-cosmos.json") captured = headers;
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
    writeStanza(process.cwd(), { "@fixture": baseUrl });
    fixture.modules["testing-cosmos"] = cosmosModule({
      adapters: [{ key: "default", match: {}, codemods: [{ id: "not-a-real-codemod" }] }],
    });

    // The runner validates codemod ids against the first-party catalog up
    // front, so this throws before any files change.
    await expect(cmdAdd(args({ slot: "testing", moduleId: "@fixture/cosmos" }))).rejects.toThrow(
      /not-a-real-codemod/,
    );

    const manifest = JSON.parse(fs.readFileSync("stanza.json", "utf8"));
    expect(manifest.modules.testing).toBeUndefined();
  });
});

function writeStanza(projectRoot: string, registries: Record<string, unknown>) {
  const file = path.join(projectRoot, "stanza.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.registries = registries;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
}
