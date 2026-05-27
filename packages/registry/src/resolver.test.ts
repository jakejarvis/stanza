import { assert, describe, expect, it } from "vite-plus/test";

import { emptyManifest } from "./manifest";
import { defineModule, type Module } from "./module";
import { activePeerIds, resolveAdapter } from "./resolver";

const drizzle: Module = defineModule({
  id: "drizzle",
  category: "orm",
  label: "Drizzle",
  description: "",
  version: "0.1.0",
  peers: { db: ["postgres", "sqlite"] },
  adapters: [
    { key: "postgres", match: { db: "postgres" } },
    { key: "sqlite", match: { db: "sqlite" } },
  ],
});

const betterAuth: Module = defineModule({
  id: "better-auth",
  category: "auth",
  label: "Better Auth",
  description: "",
  version: "0.1.0",
  peers: { orm: ["drizzle", "prisma"] },
  adapters: [
    { key: "drizzle", match: { orm: "drizzle" } },
    { key: "prisma", match: { orm: "prisma" } },
  ],
});

describe("resolveAdapter", () => {
  it("picks the adapter whose match aligns with active peers", () => {
    const result = resolveAdapter(drizzle, {
      manifest: emptyManifest({ name: "t" }),
      pending: {
        db: defineModule({
          id: "postgres",
          category: "db",
          label: "",
          description: "",
          version: "0.1.0",
          adapters: [{ key: "default", match: {} }],
        }),
      },
    });
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.adapter.key).toBe("postgres");
  });

  it("fails fast when a required peer is missing", () => {
    const result = resolveAdapter(betterAuth, {
      manifest: emptyManifest({ name: "t" }),
      pending: {},
    });
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error.kind).toBe("missing-peer");
  });

  it("rejects a peer not on the allow-list", () => {
    const result = resolveAdapter(betterAuth, {
      manifest: emptyManifest({ name: "t" }),
      pending: {
        orm: defineModule({
          id: "typeorm",
          category: "orm",
          label: "",
          description: "",
          version: "0.1.0",
          adapters: [{ key: "default", match: {} }],
        }),
      },
    });
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error.kind).toBe("incompatible-peer");
  });

  it("accepts a narrow metadata shape and returns the narrow adapter", () => {
    // ModuleMetadata strips adapter templates/codemods/install fields — the
    // web builder ships only this shape to the client. The generic must
    // preserve the input's adapter type end-to-end.
    const meta = {
      id: "drizzle",
      peers: { db: ["postgres", "sqlite"] },
      adapters: [
        { key: "postgres", match: { db: "postgres" } },
        { key: "sqlite", match: { db: "sqlite" } },
      ],
    };
    const result = resolveAdapter(meta, {
      manifest: emptyManifest({ name: "t" }),
      pending: { db: { id: "postgres" } },
    });
    assert(result.ok);
    expect(result.adapter.key).toBe("postgres");
    // @ts-expect-error — adapter type narrows to the input's adapter shape;
    // the input had no `templates`, so accessing it is a type error.
    void result.adapter.templates;
  });

  it("falls back to a default (empty-match) adapter when no peers are required", () => {
    const tailwind: Module = defineModule({
      id: "tailwind",
      category: "ui",
      label: "",
      description: "",
      version: "0.1.0",
      adapters: [{ key: "default", match: {} }],
    });
    const result = resolveAdapter(tailwind, {
      manifest: emptyManifest({ name: "t" }),
      pending: {},
    });
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.adapter.key).toBe("default");
  });
});

const next: Module = defineModule({
  id: "next",
  category: "framework",
  label: "Next.js",
  description: "",
  version: "0.1.0",
  adapters: [{ key: "default", match: {} }],
});

const vitest: Module = defineModule({
  id: "vitest",
  category: "testing",
  label: "Vitest",
  description: "",
  version: "0.1.0",
  peers: { framework: ["next", "tanstack-start"] },
  adapters: [
    { key: "next", match: { framework: "next" } },
    { key: "tanstack-start", match: { framework: "tanstack-start" } },
  ],
});

describe("resolveAdapter — add-ons", () => {
  it("dispatches an add-on adapter on the chosen framework", () => {
    const result = resolveAdapter(vitest, {
      manifest: emptyManifest({ name: "t" }),
      pending: { framework: next },
    });
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.adapter.key).toBe("next");
  });

  it("reports a missing framework peer like any slot module", () => {
    const result = resolveAdapter(vitest, {
      manifest: emptyManifest({ name: "t" }),
      pending: {},
    });
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error.kind).toBe("missing-peer");
  });

  it("never becomes a peer candidate — multi-choice categories don't affect resolution", () => {
    // A manifest where the (many-cardinality) testing category is populated must
    // not change how a one-cardinality module (better-auth) resolves: only
    // PEER_CATEGORIES surface in activePeerIds.
    const manifest = {
      ...emptyManifest({ name: "t" }),
      modules: { testing: [{ id: "vitest", version: "0.1.0", adapter: "next" }] },
    };
    const result = resolveAdapter(betterAuth, { manifest, pending: {} });
    expect(result.ok).toBe(false);
    assert(!result.ok);
    // Still missing-peer for orm — the testing pick did not satisfy or interfere.
    expect(result.error.kind).toBe("missing-peer");
  });
});

// Module with both a generic default and a framework-specific override —
// mirrors the tooling-eslint-prettier shape after its standalone refactor.
const eslintLike: Module = defineModule({
  id: "eslint-like",
  category: "tooling",
  label: "ESLint-like",
  description: "",
  version: "0.1.0",
  adapters: [
    { key: "next", match: { framework: "next" } },
    { key: "default", match: {} },
  ],
});

describe("resolveAdapter — default + framework-specific adapters coexist", () => {
  it("picks the framework-specific adapter when its peer is active", () => {
    const result = resolveAdapter(eslintLike, {
      manifest: emptyManifest({ name: "t" }),
      pending: { framework: next },
    });
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.adapter.key).toBe("next");
  });

  it("falls back to the empty-match default when no framework is selected", () => {
    const result = resolveAdapter(eslintLike, {
      manifest: emptyManifest({ name: "t" }),
      pending: {},
    });
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.adapter.key).toBe("default");
  });
});

describe("activePeerIds", () => {
  it("returns an empty record for a manifest with no selections", () => {
    expect(activePeerIds(emptyManifest({ name: "t" }))).toEqual({});
  });

  it("reads the installed framework id from the manifest", () => {
    const manifest = {
      ...emptyManifest({ name: "t" }),
      modules: {
        framework: [{ id: "next", version: "0.1.0", adapter: "default", apps: ["web"] }],
      },
    };
    expect(activePeerIds(manifest, "web")).toEqual({ framework: "next" });
  });

  it("scopes app-home peer lookups to the targetAppId", () => {
    const manifest = {
      ...emptyManifest({ name: "t" }),
      modules: {
        framework: [
          { id: "next", version: "0.1.0", adapter: "default", apps: ["web"] },
          { id: "expo", version: "0.1.0", adapter: "default", apps: ["native"] },
        ],
      },
    };
    expect(activePeerIds(manifest, "web").framework).toBe("next");
    expect(activePeerIds(manifest, "native").framework).toBe("expo");
  });
});
