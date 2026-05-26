import { describe, expect, it } from "vite-plus/test";

import { defaultWebApp } from "./manifest";
import type { AppSpec } from "./manifest";
import { defineModule, type Module } from "./module";
import type { Resolved } from "./package-json";
import { synthesizeTemplates } from "./synthesize";
import { buildRenderContext, renderTemplate } from "./template";

const webApp: AppSpec = defaultWebApp();

describe("renderTemplate", () => {
  const ctx = buildRenderContext({
    projectName: "acme",
    app: webApp,
    packageName: "@acme/auth",
  });

  it("substitutes project.name", () => {
    expect(renderTemplate("name={{project.name}}", ctx)).toBe("name=acme");
  });

  it("substitutes app.* keys", () => {
    expect(renderTemplate("{{app.id}}:{{app.kind}} ({{app.dir}})", ctx)).toBe("web:web (apps/web)");
  });

  it("substitutes the active package's own name via package.name", () => {
    expect(renderTemplate('import { auth } from "{{package.name}}";', ctx)).toBe(
      'import { auth } from "@acme/auth";',
    );
  });

  it("substitutes any package by directory via packages.<dir>.name", () => {
    expect(renderTemplate('import { db } from "{{packages.db.name}}";', ctx)).toBe(
      'import { db } from "@acme/db";',
    );
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("{{  project.name  }}", ctx)).toBe("acme");
  });

  it("renders missing keys as empty strings (non-strict Handlebars)", () => {
    expect(renderTemplate("[{{missing}}]", ctx)).toBe("[]");
    expect(renderTemplate("[{{packages.nope.name}}]", ctx)).toBe("[]");
  });

  describe("{{run}} helper", () => {
    const withPnpm = buildRenderContext({
      projectName: "acme",
      app: webApp,
      packageName: "",
      packageManager: "pnpm",
    });
    const withBun = buildRenderContext({
      projectName: "acme",
      app: webApp,
      packageName: "",
      packageManager: "bun",
    });
    const withNpm = buildRenderContext({
      projectName: "acme",
      app: webApp,
      packageName: "",
      packageManager: "npm",
    });

    it("emits `<pm> <script>` for pnpm and bun", () => {
      expect(renderTemplate('{{run "dev"}}', withPnpm)).toBe("pnpm dev");
      expect(renderTemplate('{{run "dev"}}', withBun)).toBe("bun dev");
    });

    it("emits `npm run <script>` for npm", () => {
      expect(renderTemplate('{{run "dev"}}', withNpm)).toBe("npm run dev");
      expect(renderTemplate('{{run "db:push"}}', withNpm)).toBe("npm run db:push");
    });

    it("defaults to pnpm when no package manager is supplied", () => {
      const noPm = buildRenderContext({
        projectName: "acme",
        app: webApp,
        packageName: "",
      });
      expect(renderTemplate('{{run "test"}}', noPm)).toBe("pnpm test");
    });
  });

  it("does not HTML-escape values (noEscape=true)", () => {
    // Without noEscape, the "/" in package names would become "&#x2F;".
    expect(renderTemplate("{{package.name}}", ctx)).toBe("@acme/auth");
  });

  describe("{{json}} helper", () => {
    it("serializes the env array for turbo-style globalEnv emission", () => {
      const withEnv = buildRenderContext({
        projectName: "acme",
        app: webApp,
        packageName: "",
        envNames: ["DATABASE_URL", "BETTER_AUTH_SECRET"],
      });
      expect(renderTemplate("{{json env}}", withEnv)).toBe('["BETTER_AUTH_SECRET","DATABASE_URL"]');
    });

    it("emits a valid empty array when no env names are declared", () => {
      expect(renderTemplate("{{json env}}", ctx)).toBe("[]");
    });

    it("renders null for missing keys (still valid JSON)", () => {
      expect(renderTemplate("{{json missing}}", ctx)).toBe("null");
    });
  });

  describe("peers + conditionals", () => {
    const withNext = buildRenderContext({
      projectName: "acme",
      app: webApp,
      packageName: "",
      peers: { framework: "next" },
    });
    const withTanstack = buildRenderContext({
      projectName: "acme",
      app: webApp,
      packageName: "",
      peers: { framework: "tanstack-start" },
    });
    const noFramework = buildRenderContext({
      projectName: "acme",
      app: webApp,
      packageName: "",
    });

    it("renders an `if (eq)` block when the active peer matches", () => {
      const tpl = '{{#if (eq peers.framework "next")}}NEXT{{/if}}';
      expect(renderTemplate(tpl, withNext)).toBe("NEXT");
      expect(renderTemplate(tpl, withTanstack)).toBe("");
      expect(renderTemplate(tpl, noFramework)).toBe("");
    });

    it("matches hyphenated peer ids", () => {
      const tpl = '{{#if (eq peers.framework "tanstack-start")}}TS{{/if}}';
      expect(renderTemplate(tpl, withTanstack)).toBe("TS");
      expect(renderTemplate(tpl, withNext)).toBe("");
    });

    it("renders an `unless` block when the active peer is absent", () => {
      const tpl = "{{#unless peers.framework}}NONE{{/unless}}";
      expect(renderTemplate(tpl, noFramework)).toBe("NONE");
      expect(renderTemplate(tpl, withNext)).toBe("");
    });

    it("exposes the raw peer id under {{peers.<category>}}", () => {
      expect(renderTemplate("[{{peers.framework}}]", withNext)).toBe("[next]");
      expect(renderTemplate("[{{peers.framework}}]", noFramework)).toBe("[]");
    });
  });
});

describe("buildRenderContext", () => {
  it("populates packages.<dir>.name for every PACKAGE_DIR", () => {
    const ctx = buildRenderContext({
      projectName: "acme",
      app: webApp,
      packageName: "",
    });
    // PACKAGE_DIRS is derived from CATEGORIES; auth + db are both package homes.
    expect(ctx.packages.auth?.name).toBe("@acme/auth");
    expect(ctx.packages.db?.name).toBe("@acme/db");
  });

  it("materializes every PEER_CATEGORIES key under `peers` (undefined when unset)", () => {
    const ctx = buildRenderContext({
      projectName: "acme",
      app: webApp,
      packageName: "",
      peers: { framework: "next" },
    });
    expect(ctx.peers.framework).toBe("next");
    // ui is a PEER_CATEGORY but not set — the key exists, value is undefined.
    expect("ui" in ctx.peers).toBe(true);
    expect(ctx.peers.ui).toBeUndefined();
  });

  it("sorts and dedupes envNames so module-apply order doesn't leak into output", () => {
    const ctx = buildRenderContext({
      projectName: "acme",
      app: webApp,
      packageName: "",
      envNames: ["DATABASE_URL", "BETTER_AUTH_SECRET", "DATABASE_URL", "AUTH_URL"],
    });
    expect(ctx.env).toEqual(["AUTH_URL", "BETTER_AUTH_SECRET", "DATABASE_URL"]);
  });

  it("defaults env to an empty array when envNames is omitted", () => {
    const ctx = buildRenderContext({
      projectName: "acme",
      app: webApp,
      packageName: "",
    });
    expect(ctx.env).toEqual([]);
  });
});

const drizzle: Module = defineModule({
  id: "drizzle",
  category: "orm",
  label: "Drizzle",
  description: "",
  version: "0.1.0",
  adapters: [{ key: "default", match: {} }],
});

const betterAuth: Module = defineModule({
  id: "better-auth",
  category: "auth",
  label: "Better Auth",
  description: "",
  version: "0.1.0",
  consumesPackages: ["db"],
  adapters: [
    {
      key: "default",
      match: {},
      templates: [
        {
          src: "auth.ts",
          dest: "src/auth.ts",
          scope: "package",
          template: true,
          content: 'import { db } from "{{packages.db.name}}";\nexport const auth = db;\n',
        },
        {
          src: "api.ts",
          dest: "src/api.ts",
          scope: "app",
          template: true,
          content: 'import { auth } from "{{package.name}}";\n// app={{app.id}}\n',
        },
        {
          // Not flagged template:true → should pass through unchanged.
          src: "raw.txt",
          dest: "src/raw.txt",
          scope: "package",
          content: "hello {{not.substituted}}",
        },
      ],
    },
  ],
});

describe("synthesizeTemplates", () => {
  const resolved: Resolved = {
    auth: [{ module: betterAuth, adapter: betterAuth.adapters[0]! }],
    orm: [{ module: drizzle, adapter: drizzle.adapters[0]! }],
  };

  it("substitutes package.name against the owning module's own package", () => {
    const out = synthesizeTemplates(resolved, { name: "acme" });
    const auth = out.find((t) => t.path === "packages/auth/src/auth.ts");
    expect(auth?.content).toBe('import { db } from "@acme/db";\nexport const auth = db;\n');
    const api = out.find((t) => t.path === "apps/web/src/api.ts");
    expect(api?.content).toBe('import { auth } from "@acme/auth";\n// app=web\n');
  });

  it("leaves non-template files untouched (no substitution, raw braces preserved)", () => {
    const out = synthesizeTemplates(resolved, { name: "acme" });
    const raw = out.find((t) => t.path === "packages/auth/src/raw.txt");
    expect(raw?.content).toBe("hello {{not.substituted}}");
  });

  it("honors a custom apps list (single app)", () => {
    const out = synthesizeTemplates(resolved, {
      name: "acme",
      apps: [{ id: "mobile", dir: "apps/mobile", kind: "native" }],
    });
    expect(out.find((t) => t.path === "apps/mobile/src/api.ts")).toBeDefined();
  });

  it("emits one app-scoped path per app when multiple apps target the same module", () => {
    const out = synthesizeTemplates(resolved, {
      name: "acme",
      apps: [
        { id: "web", dir: "apps/web", kind: "web" },
        { id: "native", dir: "apps/native", kind: "native" },
      ],
    });
    // Package-scoped template emits once.
    expect(out.filter((t) => t.path === "packages/auth/src/auth.ts")).toHaveLength(1);
    // App-scoped shim ships into both apps (auth has no explicit `apps` filter
    // so it defaults to all apps).
    expect(out.find((t) => t.path === "apps/web/src/api.ts")?.content).toContain("// app=web");
    expect(out.find((t) => t.path === "apps/native/src/api.ts")?.content).toContain(
      "// app=native",
    );
  });

  it("aggregates env names from every resolved entry into the {{env}} render context", () => {
    const db: Module = defineModule({
      id: "postgres",
      category: "db",
      label: "Postgres",
      description: "",
      version: "0.1.0",
      env: [{ name: "DATABASE_URL", example: "postgres://...", required: true }],
      adapters: [{ key: "default", match: {} }],
    });
    const authWithEnv: Module = defineModule({
      id: "better-auth",
      category: "auth",
      label: "Better Auth",
      description: "",
      version: "0.1.0",
      env: [
        { name: "BETTER_AUTH_SECRET", example: "...", required: true },
        { name: "BETTER_AUTH_URL", example: "http://localhost:3000", required: true },
      ],
      adapters: [
        {
          key: "default",
          match: {},
          templates: [
            {
              src: "turbo.json",
              dest: "turbo.json",
              scope: "repo",
              template: true,
              // Pad with whitespace so the trailing `}}` of `{{json env}}` isn't
              // followed immediately by another `}` — Handlebars would otherwise
              // parse `}}}` as a triple-stash close. Real turbo.json has a
              // newline + sibling keys after the helper, so this only matters
              // for a minimal smoke fixture.
              content: '{ "globalEnv": {{json env}} }\n',
            },
          ],
        },
      ],
    });
    const out = synthesizeTemplates(
      {
        db: [{ module: db, adapter: db.adapters[0]! }],
        auth: [{ module: authWithEnv, adapter: authWithEnv.adapters[0]! }],
      },
      { name: "acme" },
    );
    const turbo = out.find((t) => t.path === "turbo.json");
    expect(turbo?.content).toBe(
      '{ "globalEnv": ["BETTER_AUTH_SECRET","BETTER_AUTH_URL","DATABASE_URL"] }\n',
    );
  });
});
