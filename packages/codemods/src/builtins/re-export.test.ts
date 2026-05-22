import { emptyManifest } from "@stanza/registry";
import { describe, expect, it } from "vitest";

import { openProject, type CodemodContext, type Project } from "../index";
import reExport from "./re-export";

const BARREL = `import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
});
`;

function setup(initial: string = BARREL, opts: { barrelPath?: string } = {}) {
  const seed = openProject("/repo/apps/web");
  const inMem: Project = new (seed.constructor as new (opts: Record<string, unknown>) => Project)({
    useInMemoryFileSystem: true,
  });
  const sf = inMem.createSourceFile(opts.barrelPath ?? "/repo/apps/web/src/db/schema.ts", initial);

  const claimed: Array<{ file: string; region: string }> = [];
  const released: Array<{ file: string; region: string }> = [];

  const manifest = emptyManifest({ name: "t" });
  const ctx: CodemodContext = {
    projectRoot: "/repo",
    appRoot: "/repo/apps/web",
    project: () => inMem,
    manifest,
    owner: { category: "auth", module: "better-auth" },
    adapter: "default",
    claimRegion(file, region) {
      claimed.push({ file, region });
    },
    releaseRegion(file, region) {
      released.push({ file, region });
    },
  };

  return { ctx, sf, project: inMem, claimed, released };
}

const ARGS_STAR = { file: "src/db/schema.ts", from: "./auth-schema" };

describe("re-export", () => {
  it('appends `export * from "..."` to the barrel', () => {
    const { ctx, sf, claimed } = setup();
    const result = reExport.apply(ctx, ARGS_STAR) as { touchedFiles: string[] };

    expect(result.touchedFiles).toEqual(["apps/web/src/db/schema.ts"]);
    expect(sf.getFullText()).toContain(`export * from "./auth-schema"`);
    expect(claimed).toEqual([
      { file: "apps/web/src/db/schema.ts", region: "re-exports../auth-schema" },
    ]);
  });

  it("is idempotent on re-apply with same star args", () => {
    const { ctx, sf } = setup();
    reExport.apply(ctx, ARGS_STAR);
    const after = sf.getFullText();
    const second = reExport.apply(ctx, ARGS_STAR) as { touchedFiles: string[] };
    expect(second.touchedFiles).toEqual([]);
    expect(sf.getFullText()).toBe(after);
  });

  it("appends a named re-export when names is provided", () => {
    const { ctx, sf } = setup();
    reExport.apply(ctx, {
      file: "src/db/schema.ts",
      from: "./auth-schema",
      names: ["user", "session"],
    });
    expect(sf.getFullText()).toContain(`export { user, session } from "./auth-schema"`);
  });

  it("merges missing names into an existing named re-export", () => {
    const { ctx, sf } = setup();
    reExport.apply(ctx, {
      file: "src/db/schema.ts",
      from: "./auth-schema",
      names: ["user"],
    });
    reExport.apply(ctx, {
      file: "src/db/schema.ts",
      from: "./auth-schema",
      names: ["user", "session", "account"],
    });
    const text = sf.getFullText();
    expect(text).toMatch(
      /export\s*\{\s*user(?:,\s*session)?(?:,\s*account)?\s*\}\s*from\s*"\.\/auth-schema"/,
    );
    expect(text).toContain("user");
    expect(text).toContain("session");
    expect(text).toContain("account");
  });

  it("is idempotent when all requested named exports are already present", () => {
    const { ctx, sf } = setup();
    reExport.apply(ctx, {
      file: "src/db/schema.ts",
      from: "./auth-schema",
      names: ["user", "session"],
    });
    const after = sf.getFullText();
    const second = reExport.apply(ctx, {
      file: "src/db/schema.ts",
      from: "./auth-schema",
      names: ["user"],
    }) as { touchedFiles: string[] };
    expect(second.touchedFiles).toEqual([]);
    expect(sf.getFullText()).toBe(after);
  });

  it("throws when mixing star and named to the same source", () => {
    const { ctx } = setup();
    reExport.apply(ctx, ARGS_STAR);
    expect(() =>
      reExport.apply(ctx, {
        file: "src/db/schema.ts",
        from: "./auth-schema",
        names: ["user"],
      }),
    ).toThrow(/cannot also add the requested named re-export/);
  });

  it("revert removes the re-export and releases the region", () => {
    const { ctx, sf, released } = setup();
    reExport.apply(ctx, ARGS_STAR);
    expect(sf.getFullText()).toContain(`export * from "./auth-schema"`);
    reExport.revert!(ctx, ARGS_STAR);
    expect(sf.getFullText()).not.toContain(`export * from "./auth-schema"`);
    expect(released).toEqual([
      { file: "apps/web/src/db/schema.ts", region: "re-exports../auth-schema" },
    ]);
  });

  it("throws when the barrel file doesn't exist", () => {
    const { ctx } = setup();
    expect(() => reExport.apply(ctx, { file: "src/db/missing.ts", from: "./auth-schema" })).toThrow(
      /not found/,
    );
  });

  it('resolves against packages/<dir>/ when base is "package:<dir>"', () => {
    const { ctx, sf, claimed } = setup(BARREL, {
      barrelPath: "/repo/packages/db/src/schema.ts",
    });
    const result = reExport.apply(ctx, {
      file: "src/schema.ts",
      from: "@t/auth/auth-schema",
      base: "package:db",
    }) as { touchedFiles: string[] };

    expect(result.touchedFiles).toEqual(["packages/db/src/schema.ts"]);
    expect(sf.getFullText()).toContain(`export * from "@t/auth/auth-schema"`);
    expect(claimed).toEqual([
      { file: "packages/db/src/schema.ts", region: "re-exports.@t/auth/auth-schema" },
    ]);
  });

  it("lets two modules re-export from different sources without colliding", () => {
    const { ctx, sf, claimed } = setup();
    reExport.apply(ctx, ARGS_STAR);
    reExport.apply(ctx, { file: "src/db/schema.ts", from: "./audit-schema" });
    expect(sf.getFullText()).toContain(`export * from "./auth-schema"`);
    expect(sf.getFullText()).toContain(`export * from "./audit-schema"`);
    expect(claimed.map((c) => c.region)).toEqual([
      "re-exports../auth-schema",
      "re-exports../audit-schema",
    ]);
  });
});
