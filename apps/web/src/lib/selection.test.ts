import { defineModule, type Module } from "@stanza/registry";
import { describe, expect, it } from "vitest";

import {
  buildCommand,
  DEFAULT_NAME,
  parseSelections,
  resolveSelectedAdapters,
  selectedFiles,
  toSearchParams,
} from "./selection";

describe("parseSelections", () => {
  it("returns defaults when search is empty", () => {
    const { name, selections } = parseSelections({});
    expect(name).toBe(DEFAULT_NAME);
    expect(selections).toEqual({});
  });

  it("preserves recognized slot keys and ignores unknown keys", () => {
    const { name, selections } = parseSelections({
      name: "my-thing",
      framework: "next",
      orm: "drizzle",
      // @ts-expect-error unknown slot — should be silently dropped
      flooble: "ignored",
    });
    expect(name).toBe("my-thing");
    expect(selections).toEqual({ framework: "next", orm: "drizzle" });
  });

  it("drops empty string slot values", () => {
    const { selections } = parseSelections({ framework: "" });
    expect(selections.framework).toBeUndefined();
  });
});

describe("parseSelections — add-ons", () => {
  it("splits comma-joined add-on categories into id lists", () => {
    const { addons } = parseSelections({ testing: "vitest,playwright" });
    expect(addons.testing).toEqual(["vitest", "playwright"]);
  });

  it("drops empty add-on categories", () => {
    const { addons } = parseSelections({ testing: "" });
    expect(addons.testing).toBeUndefined();
  });
});

describe("toSearchParams", () => {
  it("round-trips a populated state", () => {
    const input = {
      name: "my-app",
      selections: { framework: "next" as const, orm: "drizzle" as const },
      addons: {},
    };
    const search = toSearchParams(input);
    expect(parseSelections(search)).toEqual(input);
  });

  it("round-trips add-on selections as comma-joined params", () => {
    const input = {
      name: DEFAULT_NAME,
      selections: { framework: "next" as const },
      addons: { testing: ["vitest", "playwright"] },
    };
    const search = toSearchParams(input);
    expect(search.testing).toBe("vitest,playwright");
    expect(parseSelections(search)).toEqual(input);
  });

  it("omits the default name to keep the URL terse", () => {
    expect(toSearchParams({ name: DEFAULT_NAME, selections: {} })).toEqual({});
  });
});

describe("buildCommand", () => {
  it("emits only the selected flags", () => {
    expect(
      buildCommand({
        name: "my-app",
        selections: { framework: "next", db: "sqlite" },
      }),
    ).toBe("pnpm create stanza my-app --framework=next --db=sqlite");
  });

  it("appends add-on flags after slot flags", () => {
    expect(
      buildCommand({
        name: "my-app",
        selections: { framework: "next" },
        addons: { testing: ["vitest", "playwright"] },
      }),
    ).toBe("pnpm create stanza my-app --framework=next --testing=vitest,playwright");
  });

  it("keeps the bare command when nothing is selected", () => {
    expect(buildCommand({ name: "my-app", selections: {} })).toBe("pnpm create stanza my-app");
  });

  it("uses the chosen package manager as the prefix", () => {
    expect(buildCommand({ name: "my-app", selections: { framework: "next" }, pm: "bun" })).toBe(
      "bun create stanza my-app --framework=next",
    );
  });

  it("inserts a -- separator before flags for npm", () => {
    expect(buildCommand({ name: "my-app", selections: { framework: "next" }, pm: "npm" })).toBe(
      "npm create stanza my-app -- --framework=next",
    );
  });

  it("omits the -- separator for npm when there are no flags", () => {
    expect(buildCommand({ name: "my-app", selections: {}, pm: "npm" })).toBe(
      "npm create stanza my-app",
    );
  });
});

describe("selectedFiles", () => {
  const drizzle: Module = defineModule({
    id: "drizzle",
    slot: "orm",
    label: "Drizzle",
    description: "",
    version: "0.1.0",
    adapters: [
      {
        key: "default",
        match: {},
        templates: [
          { src: "schema.ts", dest: "src/db/schema.ts", scope: "app" },
          { src: "drizzle.config.ts", dest: "drizzle.config.ts", scope: "app" },
        ],
      },
    ],
  });

  it("prefixes scope:app with the active app dir and leaves scope:repo bare", () => {
    const adapter = drizzle.adapters[0]!;
    // Add a repo-scoped template to the same fixture
    const adapterWithRepo = {
      ...adapter,
      templates: [
        ...(adapter.templates ?? []),
        { src: "turbo.json", dest: "turbo.json", scope: "repo" as const },
      ],
    };
    const files = selectedFiles({
      orm: { module: drizzle, adapter: adapterWithRepo },
    });
    expect(files.map((f) => f.path)).toEqual([
      "apps/web/src/db/schema.ts",
      "apps/web/drizzle.config.ts",
      "turbo.json",
    ]);
  });

  it("groups files by slot order", () => {
    const framework: Module = defineModule({
      id: "next",
      slot: "framework",
      label: "Next.js",
      description: "",
      version: "0.1.0",
      adapters: [
        {
          key: "default",
          match: {},
          templates: [{ src: "layout.tsx", dest: "app/layout.tsx", scope: "app" }],
        },
      ],
    });
    const files = selectedFiles({
      orm: { module: drizzle, adapter: drizzle.adapters[0]! },
      framework: { module: framework, adapter: framework.adapters[0]! },
    });
    // framework comes before orm in slotOrder, so its files should appear first
    expect(files[0]!.path).toBe("apps/web/app/layout.tsx");
  });

  it("appends add-on templates after slot templates", () => {
    const vitest: Module = defineModule({
      kind: "addon",
      id: "vitest",
      category: "testing",
      label: "Vitest",
      description: "",
      version: "0.1.0",
      adapters: [
        {
          key: "default",
          match: {},
          templates: [{ src: "vitest.config.ts", dest: "vitest.config.ts", scope: "app" }],
        },
      ],
    });
    const files = selectedFiles(
      { orm: { module: drizzle, adapter: drizzle.adapters[0]! } },
      { testing: [{ module: vitest, adapter: vitest.adapters[0]! }] },
    );
    // Slot files come first, the add-on's config last.
    expect(files.at(-1)!.path).toBe("apps/web/vitest.config.ts");
    expect(files.at(-1)!.owner.group).toBe("testing");
  });
});

describe("resolveSelectedAdapters", () => {
  it("picks the adapter whose match aligns with active peers", () => {
    const drizzleMod: Module = defineModule({
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
    const postgresMod: Module = defineModule({
      id: "postgres",
      slot: "db",
      label: "Postgres",
      description: "",
      version: "0.1.0",
      adapters: [{ key: "default", match: {} }],
    });
    const modules = {
      "orm:drizzle": drizzleMod,
      "db:postgres": postgresMod,
    };
    const out = resolveSelectedAdapters(modules, { orm: "drizzle", db: "postgres" });
    expect(out.orm?.adapter.key).toBe("postgres");
    expect(out.db?.adapter.key).toBe("default");
  });
});
