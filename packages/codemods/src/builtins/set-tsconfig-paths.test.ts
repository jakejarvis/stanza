import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { emptyManifest } from "@stanza/registry";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { type CodemodContext, openProject } from "../index";
import setTsconfigPaths from "./set-tsconfig-paths";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-tsconfig-"));
  fs.mkdirSync(path.join(tmp, "apps/web"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function setup(initial: Record<string, unknown>) {
  const abs = path.join(tmp, "apps/web/tsconfig.json");
  fs.writeFileSync(abs, JSON.stringify(initial, null, 2) + "\n");
  const project = openProject(path.join(tmp, "apps/web"));
  const manifest = emptyManifest({ name: "acme" });
  const ctx: CodemodContext = {
    projectRoot: tmp,
    app: manifest.apps[0]!,
    appRoot: path.join(tmp, "apps/web"),
    project: () => project,
    manifest,
    owner: { category: "ui", module: "shadcn-radix" },
    adapter: "next",
    claimRegion() {},
    releaseRegion() {},
  };
  return { ctx, abs };
}

describe("set-tsconfig-paths", () => {
  it("adds compilerOptions.paths + baseUrl when both missing", () => {
    const { ctx, abs } = setup({ compilerOptions: { strict: true } });
    const result = setTsconfigPaths.apply(ctx, {
      paths: { "@acme/ui/*": ["../../packages/ui/src/*"] },
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual(["apps/web/tsconfig.json"]);
    const next = JSON.parse(fs.readFileSync(abs, "utf8"));
    expect(next.compilerOptions.baseUrl).toBe(".");
    expect(next.compilerOptions.paths["@acme/ui/*"]).toEqual(["../../packages/ui/src/*"]);
    expect(next.compilerOptions.strict).toBe(true);
  });

  it("merges into existing paths and keeps other entries", () => {
    const { ctx, abs } = setup({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@/*": ["./src/*"] },
      },
    });
    setTsconfigPaths.apply(ctx, {
      paths: { "@acme/ui/*": ["../../packages/ui/src/*"] },
    });
    const next = JSON.parse(fs.readFileSync(abs, "utf8"));
    expect(next.compilerOptions.paths).toEqual({
      "@/*": ["./src/*"],
      "@acme/ui/*": ["../../packages/ui/src/*"],
    });
  });

  it("is idempotent on re-apply", () => {
    const { ctx } = setup({ compilerOptions: { baseUrl: "." } });
    setTsconfigPaths.apply(ctx, {
      paths: { "@acme/ui/*": ["../../packages/ui/src/*"] },
    });
    const result = setTsconfigPaths.apply(ctx, {
      paths: { "@acme/ui/*": ["../../packages/ui/src/*"] },
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual([]);
  });

  it("throws on conflicting existing value for same key", () => {
    const { ctx } = setup({
      compilerOptions: {
        paths: { "@acme/ui/*": ["./different"] },
      },
    });
    expect(() =>
      setTsconfigPaths.apply(ctx, {
        paths: { "@acme/ui/*": ["../../packages/ui/src/*"] },
      }),
    ).toThrow(/already maps "@acme\/ui\/\*"/);
  });

  it("handles a JSONC tsconfig (comments + trailing comma) without crashing", () => {
    const abs = path.join(tmp, "apps/web/tsconfig.json");
    const jsonc = `{
  // Editor hints for the IDE
  "compilerOptions": {
    "strict": true, // important
  },
}
`;
    fs.writeFileSync(abs, jsonc);
    const project = openProject(path.join(tmp, "apps/web"));
    const manifest = emptyManifest({ name: "acme" });
    const ctx: CodemodContext = {
      projectRoot: tmp,
      app: manifest.apps[0]!,
      appRoot: path.join(tmp, "apps/web"),
      project: () => project,
      manifest,
      owner: { category: "ui", module: "shadcn-radix" },
      adapter: "next",
      claimRegion() {},
      releaseRegion() {},
    };
    setTsconfigPaths.apply(ctx, {
      paths: { "@acme/ui/*": ["../../packages/ui/src/*"] },
    });
    const next = fs.readFileSync(abs, "utf8");
    // Comments should survive the rewrite.
    expect(next).toContain("// Editor hints for the IDE");
    expect(next).toContain("// important");
    expect(next).toContain('"@acme/ui/*"');
    expect(next).toContain('"baseUrl"');
  });

  it("refuses to add paths to a tsconfig that uses `extends`", () => {
    const { ctx } = setup({
      extends: "./tsconfig.base.json",
      compilerOptions: { strict: true },
    });
    expect(() =>
      setTsconfigPaths.apply(ctx, {
        paths: { "@acme/ui/*": ["../../packages/ui/src/*"] },
      }),
    ).toThrow(/extends/);
  });

  it("revert removes only the keys we added", () => {
    const { ctx, abs } = setup({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@/*": ["./src/*"] },
      },
    });
    setTsconfigPaths.apply(ctx, {
      paths: { "@acme/ui/*": ["../../packages/ui/src/*"] },
    });
    setTsconfigPaths.revert?.(ctx, {
      paths: { "@acme/ui/*": ["../../packages/ui/src/*"] },
    });
    const next = JSON.parse(fs.readFileSync(abs, "utf8"));
    expect(next.compilerOptions.paths).toEqual({ "@/*": ["./src/*"] });
  });
});
