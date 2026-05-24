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

  it("throws on a missing top-level key", () => {
    expect(() => renderTemplate("{{missing}}", ctx)).toThrow(/missing or non-string key "missing"/);
  });

  it("throws on a missing nested key", () => {
    expect(() => renderTemplate("{{packages.nope.name}}", ctx)).toThrow(
      /missing or non-string key "packages.nope.name"/,
    );
  });

  it("throws when a path resolves to an object instead of a string", () => {
    expect(() => renderTemplate("{{project}}", ctx)).toThrow(/missing or non-string key "project"/);
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
});
