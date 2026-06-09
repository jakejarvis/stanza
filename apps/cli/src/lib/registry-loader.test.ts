import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { emptyManifest } from "@withstanza/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { loadRegistries } from "./registry-loader";
import { clearInsecureWarningsForTests } from "./secure-url";

const INDEX = { generatedAt: "t", schemaVersion: 2, categories: [], modules: [] };

/** Stub `fetch` so any http(s) registry main file resolves to an empty index. */
function okFetch() {
  return vi.fn<() => Promise<{ ok: true; text: () => Promise<string> }>>(async () => ({
    ok: true,
    text: async () => JSON.stringify(INDEX),
  }));
}

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-loader-"));
  clearInsecureWarningsForTests();
  delete process.env.STANZA_REGISTRY;
  delete process.env.STANZA_ALLOW_INSECURE_REGISTRY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.STANZA_REGISTRY;
  delete process.env.STANZA_ALLOW_INSECURE_REGISTRY;
});

/** Write the empty index to a temp file and return its path. */
function writeIndexFile(): string {
  const file = path.join(tmp, "index.json");
  fs.writeFileSync(file, JSON.stringify(INDEX));
  return file;
}

describe("loadRegistries scheme enforcement", () => {
  it("rejects a remote http:// STANZA_REGISTRY without the opt-in", async () => {
    process.env.STANZA_REGISTRY = "http://mirror.example/registry/index.json";
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadRegistries()).rejects.toThrow(/must use https:\/\//);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a remote http:// STANZA_REGISTRY with the opt-in and warns", async () => {
    process.env.STANZA_REGISTRY = "http://mirror.example/registry/index.json";
    process.env.STANZA_ALLOW_INSECURE_REGISTRY = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", okFetch());
    const regs = await loadRegistries();
    expect(regs.namespaces()).toEqual(["@stanza"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cleartext http://"));
  });

  it("accepts an https:// STANZA_REGISTRY", async () => {
    process.env.STANZA_REGISTRY = "https://mirror.example/registry/index.json";
    vi.stubGlobal("fetch", okFetch());
    const regs = await loadRegistries();
    expect(regs.namespaces()).toEqual(["@stanza"]);
  });

  it("accepts a file:// STANZA_REGISTRY", async () => {
    process.env.STANZA_REGISTRY = pathToFileURL(writeIndexFile()).toString();
    const regs = await loadRegistries();
    expect(regs.namespaces()).toEqual(["@stanza"]);
  });

  it("accepts a bare filesystem path STANZA_REGISTRY", async () => {
    process.env.STANZA_REGISTRY = writeIndexFile();
    const regs = await loadRegistries();
    expect(regs.namespaces()).toEqual(["@stanza"]);
  });

  it("skips a third-party http:// registry but keeps @stanza working", async () => {
    process.env.STANZA_REGISTRY = writeIndexFile();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const manifest = emptyManifest({ name: "acme" });
    manifest.registries = { "@evil": "http://evil.example/index.json" };
    const regs = await loadRegistries(manifest);
    expect(regs.namespaces()).toContain("@stanza");
    expect(regs.namespaces()).not.toContain("@evil");
  });
});
