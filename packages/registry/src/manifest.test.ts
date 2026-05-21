import { assert, describe, expect, it } from "vitest";

import { CURRENT_MANIFEST_VERSION, emptyManifest, StanzaManifestSchema } from "./manifest";

describe("StanzaManifestSchema", () => {
  it("parses a pre-add-on manifest (no `addons` key) to an empty record", () => {
    const legacy = {
      version: CURRENT_MANIFEST_VERSION,
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "acme",
      appDir: "apps/web",
      modules: {
        framework: { id: "next", version: "0.1.0", adapter: "default" },
      },
      regions: {},
    };
    const parsed = StanzaManifestSchema.parse(legacy);
    expect(parsed.addons).toEqual({});
  });

  it("round-trips a manifest with multiple add-ons in one category", () => {
    const manifest = {
      ...emptyManifest({ name: "acme" }),
      modules: {
        framework: { id: "next", version: "0.1.0", adapter: "default" },
      },
      addons: {
        testing: [
          { id: "vitest", version: "0.1.0", adapter: "next" },
          { id: "playwright", version: "0.1.0", adapter: "next" },
        ],
      },
    };
    const parsed = StanzaManifestSchema.parse(manifest);
    assert(parsed.addons.testing);
    expect(parsed.addons.testing).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(manifest);
  });

  it("emptyManifest seeds an empty addons record", () => {
    expect(emptyManifest({ name: "acme" }).addons).toEqual({});
  });
});
