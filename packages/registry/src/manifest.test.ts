import { assert, describe, expect, it } from "vite-plus/test";

import {
  appsForRecord,
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
        "@thirdparty": "https://reg.thirdparty.dev",
        "@private": {
          url: "https://reg.private.io/{category}/{id}.json",
          headers: { Authorization: "Bearer ${TOKEN}" },
        },
      },
    };
    const parsed = StanzaManifestSchema.parse(manifest);
    expect(parsed.modules.testing?.[0]?.namespace).toBe("@thirdparty");
    expect(parsed.registries?.["@thirdparty"]).toBe("https://reg.thirdparty.dev");
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
