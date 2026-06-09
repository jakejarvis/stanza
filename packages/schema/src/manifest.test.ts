import { assert, describe, expect, it } from "vite-plus/test";

import {
  appsForRecord,
  compileManifestJsonSchema,
  CURRENT_MANIFEST_VERSION,
  declaredEnvNames,
  defaultWebApp,
  emptyManifest,
  getApp,
  selectedAll,
  selectedOne,
  StanzaManifestSchema,
} from "./manifest";

describe("StanzaManifestSchema", () => {
  it("parses a manifest with a single-choice category (one record)", () => {
    const manifest = {
      version: CURRENT_MANIFEST_VERSION,
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "acme",
      apps: [{ id: "web", dir: "apps/web", kind: "web" }],
      modules: {
        framework: [{ id: "next", version: "0.1.0", adapter: "default", apps: ["web"] }],
      },
      regions: {},
    };
    const parsed = StanzaManifestSchema.parse(manifest);
    assert(parsed.modules.framework);
    expect(parsed.modules.framework).toHaveLength(1);
    expect(parsed.modules.framework[0]!.id).toBe("next");
    expect(parsed.modules.framework[0]!.apps).toEqual(["web"]);
  });

  it("round-trips a manifest with multiple modules in one category", () => {
    const manifest = {
      ...emptyManifest({ name: "acme" }),
      modules: {
        framework: [{ id: "next", version: "0.1.0", adapter: "default", apps: ["web"] }],
        testing: [
          { id: "vitest", version: "0.1.0", adapter: "next", apps: ["web"] },
          { id: "playwright", version: "0.1.0", adapter: "next", apps: ["web"] },
        ],
      },
    };
    const parsed = StanzaManifestSchema.parse(manifest);
    assert(parsed.modules.testing);
    expect(parsed.modules.testing).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(manifest);
  });

  it("emptyManifest seeds an empty modules record and a single web app by default", () => {
    const manifest = emptyManifest({ name: "acme" });
    expect(manifest.modules).toEqual({});
    expect(manifest.apps).toEqual([defaultWebApp()]);
  });

  it("emptyManifest honors a custom apps array", () => {
    const apps = [
      { id: "web", dir: "apps/web", kind: "web" as const },
      { id: "native", dir: "apps/native", kind: "native" as const },
    ];
    expect(emptyManifest({ name: "acme", apps }).apps).toEqual(apps);
  });

  it("rejects a manifest without an apps array", () => {
    expect(() =>
      StanzaManifestSchema.parse({
        version: CURRENT_MANIFEST_VERSION,
        projectShape: "monorepo",
        packageManager: "pnpm",
        name: "acme",
        apps: [],
        modules: {},
        regions: {},
      }),
    ).toThrow(/apps/);
  });

  it("rejects an app whose `dir` escapes the project root", () => {
    const base = {
      version: CURRENT_MANIFEST_VERSION,
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "acme",
      modules: {},
      regions: {},
    } as const;
    for (const dir of ["../../etc", "a/../b", "/etc/cron.d", "C:\\Windows", ""]) {
      const result = StanzaManifestSchema.safeParse({
        ...base,
        apps: [{ id: "web", dir, kind: "web" }],
      });
      expect(result.success, `dir=${JSON.stringify(dir)} should be rejected`).toBe(false);
    }
  });

  it("rejects a manifest whose region file key escapes the project root", () => {
    const base = {
      version: CURRENT_MANIFEST_VERSION,
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "acme",
      apps: [{ id: "web", dir: "apps/web", kind: "web" }],
      modules: {},
    } as const;
    for (const file of ["../../etc/evil", "a/../b", "/etc/cron.d/x", "C:\\Windows\\x", ""]) {
      const result = StanzaManifestSchema.safeParse({
        ...base,
        regions: { [file]: { file: "next@web" } },
      });
      expect(result.success, `region key=${JSON.stringify(file)} should be rejected`).toBe(false);
    }
  });

  it("accepts normal region file keys", () => {
    const result = StanzaManifestSchema.safeParse({
      version: CURRENT_MANIFEST_VERSION,
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "acme",
      apps: [{ id: "web", dir: "apps/web", kind: "web" }],
      modules: {},
      regions: {
        "apps/web/src/db/client.ts": { file: "postgres@web" },
        ".env.example": { DATABASE_URL: "postgres@web" },
        "package.json": { "scripts.dev": "monorepo-turbo" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("still serializes to JSON Schema with the `dir` + region-key refines (published contract)", () => {
    // The field-level `.superRefine`s live in Zod's runtime layer; like the
    // existing top-level refine, they drop out of `z.toJSONSchema` rather than
    // throwing. `dir` and the `regions` keys stay plain strings/objects in the
    // published schema.
    const schema = compileManifestJsonSchema();
    const dir = (
      schema as { properties?: { apps?: { items?: { properties?: { dir?: { type?: string } } } } } }
    ).properties?.apps?.items?.properties?.dir;
    expect(dir?.type).toBe("string");
    const regions = (schema as { properties?: { regions?: { type?: string } } }).properties
      ?.regions;
    expect(regions?.type).toBe("object");
  });

  it("accepts a normal nested app `dir`", () => {
    const result = StanzaManifestSchema.safeParse({
      version: CURRENT_MANIFEST_VERSION,
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "acme",
      apps: [{ id: "web", dir: "apps/web", kind: "web" }],
      modules: {},
      regions: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects two home:app framework records targeting the same app", () => {
    const result = StanzaManifestSchema.safeParse({
      ...emptyManifest({
        name: "acme",
        apps: [{ id: "web", dir: "apps/web", kind: "web" }],
      }),
      modules: {
        framework: [
          { id: "next", version: "0.1.0", adapter: "default", apps: ["web"] },
          { id: "tanstack-start", version: "0.1.0", adapter: "default", apps: ["web"] },
        ],
      },
    });
    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues.some((i) => /≤ 1 module per app/.test(i.message))).toBe(true);
  });

  it("accepts two home:app framework records on disjoint apps", () => {
    const result = StanzaManifestSchema.safeParse({
      ...emptyManifest({
        name: "acme",
        apps: [
          { id: "web", dir: "apps/web", kind: "web" },
          { id: "native", dir: "apps/native", kind: "native" },
        ],
      }),
      modules: {
        framework: [
          { id: "next", version: "0.1.0", adapter: "default", apps: ["web"] },
          { id: "expo", version: "0.1.0", adapter: "default", apps: ["native"] },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects two home:package auth records (per-project cardinality)", () => {
    const result = StanzaManifestSchema.safeParse({
      ...emptyManifest({
        name: "acme",
        apps: [
          { id: "web", dir: "apps/web", kind: "web" },
          { id: "native", dir: "apps/native", kind: "native" },
        ],
      }),
      modules: {
        auth: [
          { id: "better-auth", version: "0.1.0", adapter: "default", apps: ["web"] },
          { id: "clerk", version: "0.1.0", adapter: "default", apps: ["native"] },
        ],
      },
    });
    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues.some((i) => /≤ 1 module per project/.test(i.message))).toBe(true);
  });
});

describe("version compatibility", () => {
  it("accepts a manifest tagged with a prior schema version", () => {
    // 0.3 is structurally a strict subset of 0.4 (the new fields are
    // optional), so the schema should accept it. readManifest re-stamps
    // to CURRENT_MANIFEST_VERSION on load so callers always see current.
    const v03 = {
      version: "0.3",
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "acme",
      apps: [{ id: "web", dir: "apps/web", kind: "web" }],
      modules: {},
      regions: {},
    };
    const parsed = StanzaManifestSchema.parse(v03);
    expect(parsed.version).toBe("0.3");
  });

  it("rejects an unknown schema version", () => {
    const future = {
      version: "9.9",
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "acme",
      apps: [{ id: "web", dir: "apps/web", kind: "web" }],
      modules: {},
      regions: {},
    };
    expect(() => StanzaManifestSchema.parse(future)).toThrow(/version/i);
  });
});

describe("third-party registries", () => {
  it("round-trips a manifest with a registries map and namespaced records", () => {
    const manifest = {
      ...emptyManifest({ name: "acme" }),
      modules: {
        framework: [{ id: "next", version: "0.1.0", adapter: "default", apps: ["web"] }],
        testing: [
          {
            id: "cosmos",
            version: "1.0.0",
            adapter: "default",
            apps: ["web"],
            namespace: "@thirdparty",
          },
        ],
      },
      registries: {
        "@thirdparty": "https://reg.thirdparty.example",
        "@private": {
          url: "https://reg.private.example/{category}/{id}.json",
          headers: { Authorization: "Bearer ${TOKEN}" },
        },
      },
    };
    const parsed = StanzaManifestSchema.parse(manifest);
    expect(parsed.modules.testing?.[0]?.namespace).toBe("@thirdparty");
    expect(parsed.registries?.["@thirdparty"]).toBe("https://reg.thirdparty.example");
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(manifest);
  });

  it("rejects @stanza as a user-declared registry", () => {
    const result = StanzaManifestSchema.safeParse({
      ...emptyManifest({ name: "acme" }),
      registries: { "@stanza": "https://example.invalid" },
    });
    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues.some((i) => /reserved/.test(i.message))).toBe(true);
  });

  it("rejects malformed namespace keys", () => {
    const result = StanzaManifestSchema.safeParse({
      ...emptyManifest({ name: "acme" }),
      registries: { acme: "https://example.invalid" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level keys (catches typos like `registies`)", () => {
    const result = StanzaManifestSchema.safeParse({
      ...emptyManifest({ name: "acme" }),
      registies: { "@acme": "https://reg.acme.example" },
    });
    expect(result.success).toBe(false);
  });
});

describe("app-aware selectors", () => {
  const base = emptyManifest({
    name: "acme",
    apps: [
      { id: "web", dir: "apps/web", kind: "web" },
      { id: "native", dir: "apps/native", kind: "native" },
    ],
  });
  const manifest = {
    ...base,
    modules: {
      framework: [
        { id: "next", version: "0.1.0", adapter: "default", apps: ["web"] },
        { id: "expo", version: "0.1.0", adapter: "default", apps: ["native"] },
      ],
      db: [{ id: "postgres", version: "0.1.0", adapter: "default" }],
    },
  };

  it("selectedOne with appId filters to records targeting that app", () => {
    expect(selectedOne(manifest, "framework", "web")?.id).toBe("next");
    expect(selectedOne(manifest, "framework", "native")?.id).toBe("expo");
  });

  it("selectedOne without appId returns the first record", () => {
    expect(selectedOne(manifest, "framework")?.id).toBe("next");
  });

  it("selectedAll with appId scopes to that app", () => {
    expect(selectedAll(manifest, "framework", "web").map((r) => r.id)).toEqual(["next"]);
  });

  it("treats records without an `apps` field as global", () => {
    expect(selectedOne(manifest, "db", "web")?.id).toBe("postgres");
    expect(selectedOne(manifest, "db", "native")?.id).toBe("postgres");
  });

  it("appsForRecord expands an absent apps field to every app", () => {
    expect(appsForRecord(manifest, manifest.modules.db[0]!).map((a) => a.id)).toEqual([
      "web",
      "native",
    ]);
  });

  it("appsForRecord narrows to the listed apps", () => {
    expect(appsForRecord(manifest, manifest.modules.framework[0]!).map((a) => a.id)).toEqual([
      "web",
    ]);
  });

  it("getApp throws when the id is unknown", () => {
    expect(() => getApp(manifest, "missing")).toThrow(/No app "missing"/);
  });
});

describe("declaredEnvNames", () => {
  it("returns an empty array when no env regions are claimed", () => {
    const manifest = emptyManifest({ name: "acme" });
    expect(declaredEnvNames(manifest)).toEqual([]);
  });

  it("returns sorted, deduped keys from the .env.example region map", () => {
    const manifest = {
      ...emptyManifest({ name: "acme" }),
      regions: {
        ".env.example": {
          DATABASE_URL: "db-postgres",
          BETTER_AUTH_SECRET: "auth-better-auth",
          BETTER_AUTH_URL: "auth-better-auth",
        },
      },
    };
    expect(declaredEnvNames(manifest)).toEqual([
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "DATABASE_URL",
    ]);
  });

  it("ignores regions on files other than .env.example", () => {
    const manifest = {
      ...emptyManifest({ name: "acme" }),
      regions: {
        "package.json": { "scripts.dev": "monorepo-turbo" },
      },
    };
    expect(declaredEnvNames(manifest)).toEqual([]);
  });
});
