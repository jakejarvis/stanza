import { emptyManifest } from "@withstanza/schema";
import { describe, expect, it } from "vite-plus/test";

import { openProject, type CodemodContext, type Project } from "../index";
import addPluginToCall from "./add-plugin-to-call";

const PLAIN_AUTH = `import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@app/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
});
`;

const AUTH_WITH_PLUGINS = `import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { existing } from "@stanza/other-plugin";

import { db } from "@app/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [existing()],
});
`;

const POLAR_ARGS = {
  file: "src/auth.ts",
  base: "package:auth" as const,
  callee: "betterAuth",
  property: "plugins",
  call: "polar({ client: polarClient, use: [checkout(), portal(), webhooks({ secret: process.env.POLAR_WEBHOOK_SECRET! })] })",
  imports: [
    {
      from: "@polar-sh/better-auth",
      named: [{ name: "polar" }, { name: "checkout" }, { name: "portal" }, { name: "webhooks" }],
    },
    {
      from: "@app/payments",
      named: [{ name: "polar", alias: "polarClient" }],
    },
  ],
};

/**
 * Spin up a ts-morph project with an in-memory auth.ts at the given content
 * inside the synthetic `packages/auth/` package, plus a mock `CodemodContext`
 * that records claimed regions.
 */
function setup(initial: string = PLAIN_AUTH) {
  const seed = openProject("/repo/apps/web");
  const inMem: Project = new (seed.constructor as new (opts: Record<string, unknown>) => Project)({
    useInMemoryFileSystem: true,
  });
  const sf = inMem.createSourceFile("/repo/packages/auth/src/auth.ts", initial);

  const claimed: Array<{ file: string; region: string }> = [];
  const released: Array<{ file: string; region: string }> = [];

  const manifest = emptyManifest({ name: "t" });
  const ctx: CodemodContext = {
    projectRoot: "/repo",
    app: manifest.apps[0]!,
    appRoot: "/repo/apps/web",
    project: () => inMem,
    manifest,
    owner: { category: "payments", module: "polar" },
    adapter: "next+better-auth",
    claimRegion(file, region) {
      claimed.push({ file, region });
    },
    releaseRegion(file, region) {
      released.push({ file, region });
    },
  };

  return { ctx, sf, project: inMem, claimed, released };
}

describe("add-plugin-to-call", () => {
  it("creates a `plugins: []` property and inserts the plugin when missing", () => {
    const { ctx, sf, claimed } = setup();
    const result = addPluginToCall.apply(ctx, POLAR_ARGS) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual(["packages/auth/src/auth.ts"]);

    const text = sf.getFullText();
    expect(text).toContain(
      `import { polar, checkout, portal, webhooks } from "@polar-sh/better-auth"`,
    );
    expect(text).toContain(`import { polar as polarClient } from "@app/payments"`);
    expect(text).toMatch(/plugins:\s*\[/);
    expect(text).toContain("polar({ client: polarClient");
    expect(claimed).toEqual([
      { file: "packages/auth/src/auth.ts", region: "betterAuth.plugins.polar" },
    ]);
  });

  it("matches the surrounding 2-space indent when creating the property", () => {
    const { ctx, sf } = setup();
    addPluginToCall.apply(ctx, POLAR_ARGS);
    const text = sf.getFullText();
    // `database:` and `emailAndPassword:` are 2-space-indented in PLAIN_AUTH.
    // The newly inserted `plugins:` should match — not jump to 4-space.
    expect(text).toMatch(/\n {2}emailAndPassword: \{ enabled: true \},\n {2}plugins: \[/);
  });

  it("appends into an existing plugins array (no clobber)", () => {
    const { ctx, sf } = setup(AUTH_WITH_PLUGINS);
    addPluginToCall.apply(ctx, POLAR_ARGS);
    const text = sf.getFullText();
    expect(text).toContain("existing()");
    expect(text).toContain("polar({ client: polarClient");
    // Compare against the full file: `existing()` precedes `polar({ client` —
    // the regex approach gets fooled by `]` inside polar's `use: [...]` array.
    expect(text.indexOf("existing()")).toBeLessThan(text.indexOf("polar({ client"));
  });

  it("is idempotent on re-apply", () => {
    const { ctx, sf } = setup();
    addPluginToCall.apply(ctx, POLAR_ARGS);
    const after1 = sf.getFullText();
    const result2 = addPluginToCall.apply(ctx, POLAR_ARGS) as { touchedFiles: string[] };
    expect(result2.touchedFiles).toEqual([]);
    expect(sf.getFullText()).toBe(after1);
  });

  it("revert removes the plugin call and its added imports", () => {
    const { ctx, sf, released } = setup();
    addPluginToCall.apply(ctx, POLAR_ARGS);
    expect(sf.getFullText()).toContain("polar({ client: polarClient");
    addPluginToCall.revert!(ctx, POLAR_ARGS);
    const reverted = sf.getFullText();
    expect(reverted).not.toContain("polar({ client: polarClient");
    expect(reverted).not.toContain("@polar-sh/better-auth");
    expect(reverted).not.toContain("@app/payments");
    expect(released).toEqual([
      { file: "packages/auth/src/auth.ts", region: "betterAuth.plugins.polar" },
    ]);
  });

  it("throws when the callee isn't found", () => {
    const { ctx } = setup(`export const auth = somethingElse({});\n`);
    expect(() => addPluginToCall.apply(ctx, POLAR_ARGS)).toThrow(/no `betterAuth\(\.\.\.\)` call/);
  });

  it("throws when the call's first argument isn't an object literal", () => {
    const { ctx } = setup(`const opts = {}; export const auth = betterAuth(opts);\n`);
    expect(() => addPluginToCall.apply(ctx, POLAR_ARGS)).toThrow(/object-literal at argument 0/);
  });

  it("throws when `plugins` exists but isn't an array literal", () => {
    const { ctx } = setup(
      `import { betterAuth } from "better-auth";\nexport const auth = betterAuth({ plugins: existing });\n`,
    );
    expect(() => addPluginToCall.apply(ctx, POLAR_ARGS)).toThrow(/needs an array literal/);
  });

  it("supports the `regionKey` override", () => {
    const { ctx, claimed } = setup();
    addPluginToCall.apply(ctx, { ...POLAR_ARGS, regionKey: "auth.polar-bridge" });
    expect(claimed).toEqual([{ file: "packages/auth/src/auth.ts", region: "auth.polar-bridge" }]);
  });

  it("anchors `before:` an existing plugin", () => {
    const { ctx, sf } = setup(AUTH_WITH_PLUGINS);
    addPluginToCall.apply(ctx, { ...POLAR_ARGS, position: "before:existing" });
    const text = sf.getFullText();
    expect(text.indexOf("polar({ client")).toBeLessThan(text.indexOf("existing()"));
  });
});
