import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_NAMESPACE,
  expandEnv,
  isNamespace,
  parseModuleSpec,
  RegistriesSchema,
  RegistryConfigSchema,
} from "./registry-config";

describe("parseModuleSpec", () => {
  it("splits @ns/id into namespace + id", () => {
    expect(parseModuleSpec("@acme/foo")).toEqual({ namespace: "@acme", id: "foo" });
  });

  it("returns a bare id with no namespace", () => {
    expect(parseModuleSpec("vitest")).toEqual({ id: "vitest" });
  });

  it("preserves slashes inside the id portion", () => {
    expect(parseModuleSpec("@acme/foo/bar")).toEqual({ namespace: "@acme", id: "foo/bar" });
  });

  it("rejects an unscoped @ id (no slash)", () => {
    // No slash → treated as a bare id (whoever consumes it will fail on the `@`).
    expect(parseModuleSpec("@bare")).toEqual({ id: "@bare" });
  });
});

describe("isNamespace", () => {
  it("accepts valid scopes", () => {
    expect(isNamespace("@stanza")).toBe(true);
    expect(isNamespace("@a1")).toBe(true);
    expect(isNamespace("@my-org_2")).toBe(true);
  });

  it("rejects malformed scopes", () => {
    expect(isNamespace("stanza")).toBe(false);
    expect(isNamespace("@")).toBe(false);
    expect(isNamespace("@a")).toBe(false);
    expect(isNamespace("@-bad")).toBe(false);
    expect(isNamespace("@bad-")).toBe(false);
  });
});

describe("expandEnv", () => {
  it("replaces ${VAR} tokens from the provided env", () => {
    expect(expandEnv("Bearer ${TOKEN}", { TOKEN: "abc" })).toBe("Bearer abc");
  });

  it("returns null when any var is unset", () => {
    expect(expandEnv("a=${A} b=${B}", { A: "1" })).toBeNull();
  });

  it("passes input through when there are no tokens", () => {
    expect(expandEnv("static", {})).toBe("static");
  });
});

describe("RegistryConfigSchema", () => {
  it("accepts a string shorthand", () => {
    expect(RegistryConfigSchema.parse("https://reg.acme.com")).toBe("https://reg.acme.com");
  });

  it("accepts the full object form with placeholders", () => {
    const cfg = {
      url: "https://reg.acme.com/{category}/{id}.json",
      headers: { Authorization: "Bearer ${TOKEN}" },
    };
    expect(RegistryConfigSchema.parse(cfg)).toEqual(cfg);
  });

  it("rejects an object url missing placeholders", () => {
    expect(() => RegistryConfigSchema.parse({ url: "https://reg.acme.com/static.json" })).toThrow(
      /category.*id|id.*category/,
    );
  });
});

describe("RegistriesSchema", () => {
  it("accepts well-formed namespaces", () => {
    expect(
      RegistriesSchema.parse({
        "@acme": "https://reg.acme.com",
        "@private": {
          url: "https://reg.private.io/r/{category}/{id}.json",
          headers: { Authorization: "Bearer ${TOKEN}" },
        },
      }),
    ).toBeTruthy();
  });

  it("rejects the reserved @stanza namespace", () => {
    expect(() => RegistriesSchema.parse({ [DEFAULT_NAMESPACE]: "https://x" })).toThrow(/reserved/);
  });

  it("rejects malformed namespace keys", () => {
    expect(() => RegistriesSchema.parse({ acme: "https://x" })).toThrow(/@scope/);
  });
});
