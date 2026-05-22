import { defineModule, type Module } from "@stanza/registry";
import { describe, expect, it } from "vitest";

import {
  buildCommand,
  DEFAULT_NAME,
  parseSelections,
  pruneUnresolved,
  resolveSelected,
  selectedFiles,
  toSearchParams,
} from "./selection";

describe("parseSelections", () => {
  it("returns defaults when search is empty", () => {
    const { name, selections } = parseSelections({});
    expect(name).toBe(DEFAULT_NAME);
    expect(selections).toEqual({});
  });

  it("preserves recognized category keys and ignores unknown keys", () => {
    const { name, selections } = parseSelections({
      name: "my-thing",
      framework: "next",
      orm: "drizzle",
      // @ts-expect-error unknown category — should be silently dropped
      flooble: "ignored",
    });
    expect(name).toBe("my-thing");
    expect(selections).toEqual({ framework: ["next"], orm: ["drizzle"] });
  });

  it("splits comma-joined multi-choice categories into id lists", () => {
    const { selections } = parseSelections({ testing: "vitest,playwright" });
    expect(selections.testing).toEqual(["vitest", "playwright"]);
  });

  it("drops empty category values", () => {
    const { selections } = parseSelections({ framework: "" });
    expect(selections.framework).toBeUndefined();
  });
});

describe("toSearchParams", () => {
  it("round-trips a populated state", () => {
    const input = {
      name: "my-app",
      selections: { framework: ["next"], orm: ["drizzle"] },
    };
    const search = toSearchParams(input);
    expect(parseSelections(search)).toEqual(input);
  });

  it("round-trips multi-choice selections as comma-joined params", () => {
    const input = {
      name: DEFAULT_NAME,
      selections: { framework: ["next"], testing: ["vitest", "playwright"] },
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
        selections: { framework: ["next"], db: ["sqlite"] },
      }),
    ).toBe("pnpm create stanza my-app --framework=next --db=sqlite");
  });

  it("emits multi-choice flags as comma-joined ids", () => {
    expect(
      buildCommand({
        name: "my-app",
        selections: { framework: ["next"], testing: ["vitest", "playwright"] },
      }),
    ).toBe("pnpm create stanza my-app --framework=next --testing=vitest,playwright");
  });

  it("keeps the bare command when nothing is selected", () => {
    expect(buildCommand({ name: "my-app", selections: {} })).toBe("pnpm create stanza my-app");
  });

  it("uses the chosen package manager as the prefix", () => {
    expect(buildCommand({ name: "my-app", selections: { framework: ["next"] }, pm: "bun" })).toBe(
      "bun create stanza my-app --framework=next",
    );
  });

  it("inserts a -- separator before flags for npm", () => {
    expect(buildCommand({ name: "my-app", selections: { framework: ["next"] }, pm: "npm" })).toBe(
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
    category: "orm",
    label: "Drizzle",
    description: "",
    version: "0.1.0",
    adapters: [
      {
        key: "default",
        match: {},
        templates: [
          { src: "schema.ts", dest: "src/index.ts", scope: "package" },
          { src: "drizzle.config.ts", dest: "drizzle.config.ts", scope: "package" },
        ],
      },
    ],
  });

  it("routes scope:package to packages/<dir> and scope:repo bare", () => {
    const adapter = drizzle.adapters[0]!;
    const adapterWithRepo = {
      ...adapter,
      templates: [
        ...(adapter.templates ?? []),
        { src: "turbo.json", dest: "turbo.json", scope: "repo" as const },
      ],
    };
    const files = selectedFiles({
      orm: [{ module: drizzle, adapter: adapterWithRepo }],
    });
    expect(files.map((f) => f.path)).toEqual([
      "packages/db/src/index.ts",
      "packages/db/drizzle.config.ts",
      "turbo.json",
    ]);
  });

  it("groups files by category order", () => {
    const framework: Module = defineModule({
      id: "next",
      category: "framework",
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
      orm: [{ module: drizzle, adapter: drizzle.adapters[0]! }],
      framework: [{ module: framework, adapter: framework.adapters[0]! }],
    });
    // framework comes before orm in categoryOrder, so its files appear first.
    expect(files[0]!.path).toBe("apps/web/app/layout.tsx");
  });

  it("emits multi-choice templates after one-choice templates", () => {
    const vitest: Module = defineModule({
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
    const files = selectedFiles({
      orm: [{ module: drizzle, adapter: drizzle.adapters[0]! }],
      testing: [{ module: vitest, adapter: vitest.adapters[0]! }],
    });
    expect(files.at(-1)!.path).toBe("apps/web/vitest.config.ts");
    expect(files.at(-1)!.owner.category).toBe("testing");
  });
});

describe("resolveSelected", () => {
  it("picks the adapter whose match aligns with active peers", () => {
    const drizzleMod: Module = defineModule({
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
    const postgresMod: Module = defineModule({
      id: "postgres",
      category: "db",
      label: "Postgres",
      description: "",
      version: "0.1.0",
      adapters: [{ key: "default", match: {} }],
    });
    const modules = {
      "orm:drizzle": drizzleMod,
      "db:postgres": postgresMod,
    };
    const out = resolveSelected(modules, { orm: ["drizzle"], db: ["postgres"] });
    expect(out.orm?.[0]?.adapter.key).toBe("postgres");
    expect(out.db?.[0]?.adapter.key).toBe("default");
  });
});

describe("pruneUnresolved", () => {
  const postgres: Module = defineModule({
    id: "postgres",
    category: "db",
    label: "Postgres",
    description: "",
    version: "0.1.0",
    adapters: [{ key: "default", match: {} }],
  });
  const drizzle: Module = defineModule({
    id: "drizzle",
    category: "orm",
    label: "Drizzle",
    description: "",
    version: "0.1.0",
    peers: { db: ["postgres"] },
    adapters: [{ key: "postgres", match: { db: "postgres" } }],
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
    peers: { framework: ["next"] },
    adapters: [{ key: "next", match: { framework: "next" } }],
  });
  const modules: Record<string, Module> = {
    "db:postgres": postgres,
    "orm:drizzle": drizzle,
    "framework:next": next,
    "testing:vitest": vitest,
  };

  it("drops a category whose peer is missing", () => {
    expect(pruneUnresolved(modules, { orm: ["drizzle"] })).toEqual({});
  });

  it("keeps a category once its peer is present", () => {
    expect(pruneUnresolved(modules, { orm: ["drizzle"], db: ["postgres"] })).toEqual({
      orm: ["drizzle"],
      db: ["postgres"],
    });
  });

  it("drops a multi-choice module whose framework peer is missing", () => {
    expect(pruneUnresolved(modules, { testing: ["vitest"] })).toEqual({});
  });

  it("keeps a multi-choice module once its framework peer is present", () => {
    expect(pruneUnresolved(modules, { framework: ["next"], testing: ["vitest"] })).toEqual({
      framework: ["next"],
      testing: ["vitest"],
    });
  });

  it("cascades: dropping db strands orm and its dependents in one call", () => {
    expect(pruneUnresolved(modules, { framework: ["next"], orm: ["drizzle"] })).toEqual({
      framework: ["next"],
    });
  });
});
