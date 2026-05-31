import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_NAMESPACE,
  expandEnv,
  isLikelyNamespaceTypo,
  isNamespace,
  isValidModuleId,
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

  it("preserves the lenient behavior for an unscoped @ id (no slash)", () => {
    // parseModuleSpec stays lenient — callers wanting strictness should
    // check isLikelyNamespaceTypo first.
    expect(parseModuleSpec("@bare")).toEqual({ id: "@bare" });
  });
});

describe("isLikelyNamespaceTypo", () => {
  it("flags a leading-@ input with no slash", () => {
    expect(isLikelyNamespaceTypo("@bare")).toBe(true);
    expect(isLikelyNamespaceTypo("@acme")).toBe(true);
  });

  it("accepts well-formed @ns/id specs", () => {
    expect(isLikelyNamespaceTypo("@acme/foo")).toBe(false);
    expect(isLikelyNamespaceTypo("@acme/foo/bar")).toBe(false);
  });

  it("accepts bare ids", () => {
    expect(isLikelyNamespaceTypo("vitest")).toBe(false);
    expect(isLikelyNamespaceTypo("better-auth")).toBe(false);
  });
});

describe("isValidModuleId", () => {
  it("accepts single-segment ids", () => {
    expect(isValidModuleId("vitest")).toBe(true);
    expect(isValidModuleId("better-auth")).toBe(true);
    expect(isValidModuleId("a1")).toBe(true);
  });

  it("accepts nested segments", () => {
    expect(isValidModuleId("foo/bar")).toBe(true);
    expect(isValidModuleId("a/b/c")).toBe(true);
  });

  it("rejects path traversal and url-injection patterns", () => {
    expect(isValidModuleId("..")).toBe(false);
    expect(isValidModuleId("foo/..")).toBe(false);
    expect(isValidModuleId("../etc")).toBe(false);
    expect(isValidModuleId("foo?x=1")).toBe(false);
    expect(isValidModuleId("foo#frag")).toBe(false);
    expect(isValidModuleId("foo%20bar")).toBe(false);
    expect(isValidModuleId("foo bar")).toBe(false);
  });

  it("rejects leading/trailing/double slashes", () => {
    expect(isValidModuleId("/foo")).toBe(false);
    expect(isValidModuleId("foo/")).toBe(false);
    expect(isValidModuleId("foo//bar")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isValidModuleId("")).toBe(false);
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

  it("returns null when a var is set to the empty string", () => {
    // Otherwise `Authorization: Bearer ${TOKEN}` with TOKEN="" produces
    // a literal `Bearer ` header with a trailing space.
    expect(expandEnv("Bearer ${TOKEN}", { TOKEN: "" })).toBeNull();
  });

  it("passes input through when there are no tokens", () => {
    expect(expandEnv("static", {})).toBe("static");
  });
});

describe("RegistryConfigSchema", () => {
  it("accepts a string shorthand", () => {
    expect(RegistryConfigSchema.parse("https://reg.acme.example")).toBe("https://reg.acme.example");
  });

  it("accepts the full object form (url = main-file URL + optional auth)", () => {
    const cfg = {
      url: "https://reg.acme.example/registry.json",
      headers: { Authorization: "Bearer ${TOKEN}" },
    };
    expect(RegistryConfigSchema.parse(cfg)).toEqual(cfg);
  });

  it("rejects legacy/unknown object keys (e.g. indexUrl)", () => {
    expect(() =>
      RegistryConfigSchema.parse({ url: "https://reg.acme.example/index.json", indexUrl: "x" }),
    ).toThrow(/indexUrl|[Uu]nrecognized/);
  });
});

describe("RegistriesSchema", () => {
  it("accepts well-formed namespaces", () => {
    expect(
      RegistriesSchema.parse({
        "@acme": "https://reg.acme.example",
        "@private": {
          url: "https://reg.private.example/registry.json",
          headers: { Authorization: "Bearer ${TOKEN}" },
        },
      }),
    ).toBeTruthy();
  });

  it("rejects the reserved @stanza namespace", () => {
    expect(() => RegistriesSchema.parse({ [DEFAULT_NAMESPACE]: "https://x.example" })).toThrow(
      /reserved/,
    );
  });

  it("rejects malformed namespace keys", () => {
    expect(() => RegistriesSchema.parse({ acme: "https://x.example" })).toThrow(/@scope/);
  });
});
