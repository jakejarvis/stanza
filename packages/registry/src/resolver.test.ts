import { describe, expect, it } from "vitest";

import { emptyManifest } from "./manifest";
import { defineModule, type Module } from "./module";
import { resolveAdapter } from "./resolver";

const drizzle: Module = defineModule({
  id: "drizzle",
  slot: "orm",
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
  slot: "auth",
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
          slot: "db",
          label: "",
          description: "",
          version: "0.1.0",
          adapters: [{ key: "default", match: {} }],
        }),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.adapter.key).toBe("postgres");
  });

  it("fails fast when a required peer is missing", () => {
    const result = resolveAdapter(betterAuth, {
      manifest: emptyManifest({ name: "t" }),
      pending: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("missing-peer");
  });

  it("rejects a peer not on the allow-list", () => {
    const result = resolveAdapter(betterAuth, {
      manifest: emptyManifest({ name: "t" }),
      pending: {
        orm: defineModule({
          id: "typeorm",
          slot: "orm",
          label: "",
          description: "",
          version: "0.1.0",
          adapters: [{ key: "default", match: {} }],
        }),
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("incompatible-peer");
  });

  it("falls back to a default (empty-match) adapter when no peers are required", () => {
    const tailwind: Module = defineModule({
      id: "tailwind",
      slot: "styling",
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
    if (result.ok) expect(result.adapter.key).toBe("default");
  });
});
