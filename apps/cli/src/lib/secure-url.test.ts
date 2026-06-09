import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { assertSecureFetchUrl, clearInsecureWarningsForTests } from "./secure-url";

beforeEach(() => {
  clearInsecureWarningsForTests();
  delete process.env.STANZA_ALLOW_INSECURE_REGISTRY;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.STANZA_ALLOW_INSECURE_REGISTRY;
});

describe("assertSecureFetchUrl", () => {
  it("rejects a remote http:// URL without the opt-in", () => {
    expect(() => assertSecureFetchUrl("http://mirror.example/index.json", "Registry URL")).toThrow(
      /must use https:\/\//,
    );
  });

  it.each([
    "https://stanza.tools/registry/index.json",
    "file:///tmp/reg/index.json",
    "/abs/path/index.json",
    "./relative/index.json",
  ])("accepts non-cleartext sources (%s)", (uri) => {
    expect(() => assertSecureFetchUrl(uri, "Registry URL")).not.toThrow();
  });

  it.each([
    "http://localhost:4000/index.json",
    "http://127.0.0.1:4873/pkg",
    "http://127.0.0.53/index.json",
    "http://[::1]:8080/index.json",
  ])("accepts loopback http:// without the opt-in (%s)", (uri) => {
    expect(() => assertSecureFetchUrl(uri, "npm registry URL")).not.toThrow();
  });

  it("does not treat a host that merely starts with 127. as loopback", () => {
    expect(() => assertSecureFetchUrl("http://127.evil.com/index.json", "Registry URL")).toThrow(
      /must use https:\/\//,
    );
  });

  it("allows a remote http:// URL and warns once when the opt-in is set", () => {
    process.env.STANZA_ALLOW_INSECURE_REGISTRY = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      assertSecureFetchUrl("http://mirror.example/index.json", "Registry URL"),
    ).not.toThrow();
    // Same endpoint a second time: still allowed, but not warned again.
    assertSecureFetchUrl("http://mirror.example/index.json", "Registry URL");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cleartext http://"));
  });
});
