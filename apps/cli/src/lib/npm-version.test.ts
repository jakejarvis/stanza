import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearVersionCacheForTests, resolveRange, resolveRanges } from "./npm-version";

const VERSIONS = ["1.6.11", "1.6.20", "1.7.0", "1.8.3", "2.0.0"];

type FakeResponse = { ok: boolean; json: () => Promise<unknown> };
type FetchStub = () => Promise<FakeResponse>;

/** Build a fetch stub that returns an abbreviated packument for the given versions. */
function mockFetch(versions: string[] = VERSIONS) {
  return vi.fn<FetchStub>(async () => ({
    ok: true,
    json: async () => ({
      versions: Object.fromEntries(versions.map((v) => [v, {}])),
    }),
  }));
}

beforeEach(() => {
  clearVersionCacheForTests();
  delete process.env.STANZA_NO_NPM_LOOKUP;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STANZA_NO_NPM_LOOKUP;
});

describe("resolveRange", () => {
  it("bumps a caret range to the latest satisfying version, keeping the modifier", async () => {
    vi.stubGlobal("fetch", mockFetch());
    expect(await resolveRange("better-auth", "^1.6.11")).toBe("^1.8.3");
  });

  it("keeps a tilde range within its patch line", async () => {
    vi.stubGlobal("fetch", mockFetch());
    expect(await resolveRange("better-auth", "~1.6.11")).toBe("~1.6.20");
  });

  it.each(["1.6.11", ">=1.6.11", "1.6.11 || 2.0.0", "1.x", "workspace:*", "*", "latest"])(
    "leaves non-^/~ ranges verbatim without fetching (%s)",
    async (range) => {
      const fetchMock = mockFetch();
      vi.stubGlobal("fetch", fetchMock);
      expect(await resolveRange("better-auth", range)).toBe(range);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("falls back to the input range when STANZA_NO_NPM_LOOKUP is set", async () => {
    process.env.STANZA_NO_NPM_LOOKUP = "1";
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveRange("better-auth", "^1.6.11")).toBe("^1.6.11");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back when the request rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchStub>(async () => {
        throw new Error("offline");
      }),
    );
    expect(await resolveRange("better-auth", "^1.6.11")).toBe("^1.6.11");
  });

  it("falls back on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchStub>(async () => ({ ok: false, json: async () => ({}) })),
    );
    expect(await resolveRange("nope", "^1.6.11")).toBe("^1.6.11");
  });

  it("falls back when nothing satisfies the range", async () => {
    vi.stubGlobal("fetch", mockFetch(["0.9.0"]));
    expect(await resolveRange("better-auth", "^1.6.11")).toBe("^1.6.11");
  });

  it("caches per package name across calls", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    await resolveRange("better-auth", "^1.6.11");
    await resolveRange("better-auth", "~1.6.11");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("encodes scoped package names", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    await resolveRange("@scope/pkg", "^1.6.11");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/@scope%2Fpkg"),
      expect.anything(),
    );
  });
});

describe("resolveRanges", () => {
  it("resolves a map in parallel, falling back per entry", async () => {
    vi.stubGlobal("fetch", mockFetch());
    expect(await resolveRanges({ "better-auth": "^1.6.11", zod: ">=3" })).toEqual({
      "better-auth": "^1.8.3",
      zod: ">=3",
    });
  });
});
