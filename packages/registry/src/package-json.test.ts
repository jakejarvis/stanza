import { describe, expect, it } from "vite-plus/test";

import { defineModule, type Module, ModuleSchema } from "./module";
import {
  mergeInstallFields,
  type Resolved,
  rootPackageJson,
  type SynthesizeEntry,
  synthesizePackageJsons,
} from "./package-json";

const baseAdapter = (overrides: object = {}) => ({ key: "default", match: {}, ...overrides });

describe("mergeInstallFields", () => {
  it("merges module + adapter primary fields with adapter winning per-key", () => {
    const mod = defineModule({
      id: "x",
      category: "ui",
      label: "x",
      description: "",
      version: "0.1.0",
      dependencies: { a: "^1", b: "^1" },
      adapters: [baseAdapter({ dependencies: { b: "^2", c: "^1" } })],
    });
    const merged = mergeInstallFields(mod, mod.adapters[0]!);
    expect(merged.dependencies).toEqual({ a: "^1", b: "^2", c: "^1" });
  });

  it("merges the `app` overlay the same way (adapter wins per-key)", () => {
    const mod = defineModule({
      id: "x",
      category: "ui",
      label: "x",
      description: "",
      version: "0.1.0",
      app: { dependencies: { a: "^1", b: "^1" } },
      adapters: [baseAdapter({ app: { dependencies: { b: "^2", c: "^1" } } })],
    });
    const merged = mergeInstallFields(mod, mod.adapters[0]!);
    expect(merged.app.dependencies).toEqual({ a: "^1", b: "^2", c: "^1" });
  });

  it("returns an empty `app` block when neither module nor adapter declares one", () => {
    const mod = defineModule({
      id: "x",
      category: "ui",
      label: "x",
      description: "",
      version: "0.1.0",
      adapters: [baseAdapter()],
    });
    const merged = mergeInstallFields(mod, mod.adapters[0]!);
    expect(merged.app).toEqual({ dependencies: {}, devDependencies: {}, scripts: {}, env: [] });
  });
});

describe("synthesizePackageJsons with `app` overlay", () => {
  it("routes app.dependencies to each consuming app while keeping primary in packages/<dir>/", () => {
    const ui: Module = defineModule({
      id: "shadcn-radix",
      category: "ui",
      label: "shadcn",
      description: "",
      version: "0.1.0",
      dependencies: { "radix-ui": "^1.4.3" },
      adapters: [
        baseAdapter({
          dependencies: { "tw-animate-css": "^1.4.0" },
          app: { dependencies: { "next-themes": "^0.4.6" } },
        }),
      ],
    });
    const resolved: Resolved = {
      ui: [{ module: ui, adapter: ui.adapters[0]! }],
    };
    const out = synthesizePackageJsons(resolved, {
      name: "acme",
      apps: [{ id: "web", dir: "apps/web", kind: "web" }],
    });

    // Primary deps land in the shared package.
    expect(out["packages/ui/package.json"]?.dependencies?.["radix-ui"]).toBe("^1.4.3");
    expect(out["packages/ui/package.json"]?.dependencies?.["tw-animate-css"]).toBe("^1.4.0");
    expect(out["packages/ui/package.json"]?.dependencies?.["next-themes"]).toBeUndefined();

    // App overlay lands in the consuming app, alongside the workspace dep.
    expect(out["apps/web/package.json"]?.dependencies?.["next-themes"]).toBe("^0.4.6");
    expect(out["apps/web/package.json"]?.dependencies?.["@acme/ui"]).toBe("workspace:*");
  });

  it("fans the overlay to every consuming app", () => {
    const ui: Module = defineModule({
      id: "shadcn-radix",
      category: "ui",
      label: "shadcn",
      description: "",
      version: "0.1.0",
      adapters: [baseAdapter({ app: { dependencies: { "next-themes": "^0.4.6" } } })],
    });
    const resolved: Resolved = {
      ui: [{ module: ui, adapter: ui.adapters[0]! }],
    };
    const out = synthesizePackageJsons(resolved, {
      name: "acme",
      apps: [
        { id: "web", dir: "apps/web", kind: "web" },
        { id: "admin", dir: "apps/admin", kind: "web" },
      ],
    });
    expect(out["apps/web/package.json"]?.dependencies?.["next-themes"]).toBe("^0.4.6");
    expect(out["apps/admin/package.json"]?.dependencies?.["next-themes"]).toBe("^0.4.6");
  });

  it("respects the entry's `apps` filter when fanning the overlay", () => {
    const ui: Module = defineModule({
      id: "shadcn-radix",
      category: "ui",
      label: "shadcn",
      description: "",
      version: "0.1.0",
      adapters: [baseAdapter({ app: { dependencies: { "next-themes": "^0.4.6" } } })],
    });
    const resolved: Partial<Record<"ui", SynthesizeEntry[]>> = {
      ui: [{ module: ui, adapter: ui.adapters[0]!, apps: ["web"] }],
    };
    const out = synthesizePackageJsons(resolved, {
      name: "acme",
      apps: [
        { id: "web", dir: "apps/web", kind: "web" },
        { id: "admin", dir: "apps/admin", kind: "web" },
      ],
    });
    expect(out["apps/web/package.json"]?.dependencies?.["next-themes"]).toBe("^0.4.6");
    expect(out["apps/admin/package.json"]?.dependencies?.["next-themes"]).toBeUndefined();
  });

  it("is a no-op when the overlay is empty", () => {
    const ui: Module = defineModule({
      id: "shadcn-radix",
      category: "ui",
      label: "shadcn",
      description: "",
      version: "0.1.0",
      dependencies: { "radix-ui": "^1.4.3" },
      adapters: [baseAdapter()],
    });
    const resolved: Resolved = {
      ui: [{ module: ui, adapter: ui.adapters[0]! }],
    };
    const out = synthesizePackageJsons(resolved, {
      name: "acme",
      apps: [{ id: "web", dir: "apps/web", kind: "web" }],
    });
    // Workspace dep is still present (the package is non-empty), but no
    // unexpected app-level extras.
    expect(Object.keys(out["apps/web/package.json"]?.dependencies ?? {})).toEqual(["@acme/ui"]);
  });
});

describe("rootPackageJson default scripts", () => {
  it("uses pnpm's recursive runner for pnpm projects", () => {
    const pkg = rootPackageJson({ name: "acme", packageManager: "pnpm" });
    expect(pkg.scripts).toEqual({
      dev: "pnpm -r run dev",
      build: "pnpm -r run build",
      test: "pnpm -r run test",
      lint: "pnpm -r run lint",
    });
  });

  it("uses bun's --filter selector for bun projects", () => {
    const pkg = rootPackageJson({ name: "acme", packageManager: "bun" });
    expect(pkg.scripts?.dev).toBe("bun run --filter '*' dev");
    expect(pkg.scripts?.build).toBe("bun run --filter '*' build");
  });

  it("uses npm's --workspaces flag for npm projects", () => {
    const pkg = rootPackageJson({ name: "acme", packageManager: "npm" });
    expect(pkg.scripts?.dev).toBe("npm run dev --workspaces --if-present");
    expect(pkg.scripts?.test).toBe("npm run test --workspaces --if-present");
  });
});

describe("synthesizePackageJsons monorepo overrides", () => {
  it("lets a monorepo module overwrite rootPackageJson's seeded scripts", () => {
    const turbo: Module = defineModule({
      id: "turbo",
      category: "monorepo",
      label: "Turborepo",
      description: "",
      version: "0.1.0",
      scripts: {
        dev: "turbo run dev",
        build: "turbo run build",
      },
      adapters: [baseAdapter()],
    });
    const resolved: Resolved = {
      monorepo: [{ module: turbo, adapter: turbo.adapters[0]! }],
    };
    const out = synthesizePackageJsons(resolved, {
      name: "acme",
      apps: [{ id: "web", dir: "apps/web", kind: "web" }],
      packageManager: "pnpm",
    });
    // turbo replaces the pmRecursive-seeded defaults rather than colliding.
    expect(out["package.json"]?.scripts?.dev).toBe("turbo run dev");
    expect(out["package.json"]?.scripts?.build).toBe("turbo run build");
    // Unclaimed defaults stay (test/lint not declared by the module).
    expect(out["package.json"]?.scripts?.test).toBe("pnpm -r run test");
    expect(out["package.json"]?.scripts?.lint).toBe("pnpm -r run lint");
  });
});

describe("defineModule app-overlay validation", () => {
  it("throws when a repo-home module declares module-level app fields", () => {
    expect(() =>
      defineModule({
        id: "biome",
        category: "tooling",
        label: "Biome",
        description: "",
        version: "0.1.0",
        app: { dependencies: { x: "^1" } },
        adapters: [baseAdapter()],
      }),
    ).toThrow(/forbidden for `home: "repo"` modules/);
  });

  it("throws when a repo-home module declares adapter-level app fields", () => {
    expect(() =>
      defineModule({
        id: "biome",
        category: "tooling",
        label: "Biome",
        description: "",
        version: "0.1.0",
        adapters: [baseAdapter({ app: { devDependencies: { y: "^1" } } })],
      }),
    ).toThrow(/forbidden for `home: "repo"` modules/);
  });

  it("allows app fields on package-home modules", () => {
    expect(() =>
      defineModule({
        id: "x",
        category: "ui",
        label: "x",
        description: "",
        version: "0.1.0",
        app: { dependencies: { "next-themes": "^0.4.6" } },
        adapters: [baseAdapter()],
      }),
    ).not.toThrow();
  });

  it("allows empty app overlay on repo-home modules", () => {
    expect(() =>
      defineModule({
        id: "biome",
        category: "tooling",
        label: "Biome",
        description: "",
        version: "0.1.0",
        app: {},
        adapters: [baseAdapter()],
      }),
    ).not.toThrow();
  });
});

describe("ModuleSchema (Zod) app-overlay validation", () => {
  it("rejects HTTP-loaded manifests with app fields on repo-home modules", () => {
    const bad = {
      id: "biome",
      category: "tooling" as const,
      label: "Biome",
      description: "",
      version: "0.1.0",
      app: { dependencies: { x: "^1" } },
      adapters: [{ key: "default", match: {} }],
    };
    const result = ModuleSchema.safeParse(bad);
    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues.some((i) => /forbidden for `home: "repo"`/.test(i.message))).toBe(true);
  });

  it("accepts manifests with app fields on package-home modules", () => {
    const ok = {
      id: "x",
      category: "ui" as const,
      label: "x",
      description: "",
      version: "0.1.0",
      app: { dependencies: { "next-themes": "^0.4.6" } },
      adapters: [{ key: "default", match: {} }],
    };
    expect(ModuleSchema.safeParse(ok).success).toBe(true);
  });
});
