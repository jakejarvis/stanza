import { assert, describe, expect, it } from "vitest";

import { CURRENT_MANIFEST_VERSION, emptyManifest, StanzaManifestSchema } from "./manifest";

describe("StanzaManifestSchema", () => {
  it("parses a manifest with a single-choice category (one record)", () => {
    const manifest = {
      version: CURRENT_MANIFEST_VERSION,
      projectShape: "monorepo",
      packageManager: "pnpm",
      name: "acme",
      appDir: "apps/web",
      modules: {
        framework: [{ id: "next", version: "0.1.0", adapter: "default" }],
      },
      regions: {},
    };
    const parsed = StanzaManifestSchema.parse(manifest);
    assert(parsed.modules.framework);
    expect(parsed.modules.framework).toHaveLength(1);
    expect(parsed.modules.framework[0]!.id).toBe("next");
  });

  it("round-trips a manifest with multiple modules in one category", () => {
    const manifest = {
      ...emptyManifest({ name: "acme" }),
      modules: {
        framework: [{ id: "next", version: "0.1.0", adapter: "default" }],
        testing: [
          { id: "vitest", version: "0.1.0", adapter: "next" },
          { id: "playwright", version: "0.1.0", adapter: "next" },
        ],
      },
    };
    const parsed = StanzaManifestSchema.parse(manifest);
    assert(parsed.modules.testing);
    expect(parsed.modules.testing).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(manifest);
  });

  it("emptyManifest seeds an empty modules record", () => {
    expect(emptyManifest({ name: "acme" }).modules).toEqual({});
  });
});
