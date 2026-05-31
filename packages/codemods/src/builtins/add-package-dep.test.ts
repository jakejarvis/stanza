import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { emptyManifest } from "@withstanza/schema";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { openProject, type CodemodContext } from "../index";
import addPackageDep from "./add-package-dep";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-add-pkg-dep-"));
  // Synthetic monorepo: root + packages/auth/.
  fs.mkdirSync(path.join(tmp, "packages/auth"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "packages/auth/package.json"),
    JSON.stringify({ name: "@app/auth", dependencies: { "better-auth": "^1.6.11" } }, null, 2) +
      "\n",
  );
  fs.mkdirSync(path.join(tmp, "apps/web"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "apps/web/package.json"),
    JSON.stringify({ name: "@app/web", dependencies: { next: "^16.2.6" } }, null, 2) + "\n",
  );
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function ctxFor(): {
  ctx: CodemodContext;
  claimed: Array<{ file: string; region: string }>;
  released: Array<{ file: string; region: string }>;
} {
  const manifest = emptyManifest({ name: "app" });
  const claimed: Array<{ file: string; region: string }> = [];
  const released: Array<{ file: string; region: string }> = [];
  const ctx: CodemodContext = {
    projectRoot: tmp,
    app: manifest.apps[0]!,
    appRoot: path.join(tmp, "apps/web"),
    project: () => openProject(tmp),
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
  return { ctx, claimed, released };
}

describe("add-package-dep", () => {
  it("adds a workspace dep to a sibling package's package.json", () => {
    const { ctx } = ctxFor();
    const result = addPackageDep.apply(ctx, {
      base: "package:auth",
      name: "@app/payments",
    }) as { touchedFiles: string[] };

    expect(result.touchedFiles).toEqual(["packages/auth/package.json"]);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, "packages/auth/package.json"), "utf8"));
    expect(pkg.dependencies["@app/payments"]).toBe("workspace:*");
    // Existing dep preserved.
    expect(pkg.dependencies["better-auth"]).toBe("^1.6.11");
  });

  it("respects an explicit range", () => {
    const { ctx } = ctxFor();
    addPackageDep.apply(ctx, {
      base: "package:auth",
      name: "@polar-sh/better-auth",
      range: "^1.8.4",
    });
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, "packages/auth/package.json"), "utf8"));
    expect(pkg.dependencies["@polar-sh/better-auth"]).toBe("^1.8.4");
  });

  it("adds to devDependencies when `dev: true`", () => {
    const { ctx } = ctxFor();
    addPackageDep.apply(ctx, {
      base: "package:auth",
      name: "@types/node",
      range: "^25.0.0",
      dev: true,
    });
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, "packages/auth/package.json"), "utf8"));
    expect(pkg.devDependencies["@types/node"]).toBe("^25.0.0");
    expect(pkg.dependencies["@types/node"]).toBeUndefined();
  });

  it("writes to the app's package.json when base is `app`", () => {
    const { ctx } = ctxFor();
    addPackageDep.apply(ctx, { base: "app", name: "@app/payments" });
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, "apps/web/package.json"), "utf8"));
    expect(pkg.dependencies["@app/payments"]).toBe("workspace:*");
  });

  it("revert removes the dep", () => {
    const { ctx } = ctxFor();
    addPackageDep.apply(ctx, { base: "package:auth", name: "@app/payments" });
    addPackageDep.revert!(ctx, { base: "package:auth", name: "@app/payments" });
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, "packages/auth/package.json"), "utf8"));
    expect(pkg.dependencies["@app/payments"]).toBeUndefined();
    // Original dep untouched.
    expect(pkg.dependencies["better-auth"]).toBe("^1.6.11");
  });
});
