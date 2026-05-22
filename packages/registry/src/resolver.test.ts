import { assert, describe, expect, it } from "vitest";

import { emptyManifest } from "./manifest";
import { defineModule, type Module } from "./module";
import { resolveAdapter } from "./resolver";

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

  it("falls back to a default (empty-match) adapter when no peers are required", () => {
    const tailwind: Module = defineModule({
      id: "tailwind",
      category: "styling",
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
