import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  addPackageDependency,
  addPackageScript,
  mergeJson,
  removePackageDependency,
} from "./json.ts";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-test-"));
});

function writePkg(contents: object): string {
  const p = path.join(tmp, "package.json");
  fs.writeFileSync(p, JSON.stringify(contents, null, 2));
  return p;
}

describe("addPackageDependency", () => {
  it("adds to dependencies by default", () => {
    const p = writePkg({ name: "x", dependencies: { react: "^18" } });
    addPackageDependency(p, "better-auth", "^1.0.0");
    const out = JSON.parse(fs.readFileSync(p, "utf8"));
    expect(out.dependencies["better-auth"]).toBe("^1.0.0");
    expect(out.dependencies.react).toBe("^18");
  });

  it("creates devDependencies when dev: true", () => {
    const p = writePkg({ name: "x" });
    addPackageDependency(p, "vitest", "^2", { dev: true });
    const out = JSON.parse(fs.readFileSync(p, "utf8"));
    expect(out.devDependencies.vitest).toBe("^2");
  });
});

describe("removePackageDependency", () => {
  it("removes from both dependencies and devDependencies", () => {
    const p = writePkg({
      name: "x",
      dependencies: { foo: "1" },
      devDependencies: { foo: "1" },
    });
    removePackageDependency(p, "foo");
    const out = JSON.parse(fs.readFileSync(p, "utf8"));
    expect(out.dependencies.foo).toBeUndefined();
    expect(out.devDependencies.foo).toBeUndefined();
  });
});

describe("mergeJson", () => {
  it("deep-merges objects and reports touched paths", () => {
    const p = writePkg({ name: "x", scripts: { dev: "vite" } });
    const touched = mergeJson(p, {
      scripts: { dev: "vite --host", db: "drizzle" },
    });
    expect(touched).toContain("scripts.dev");
    expect(touched).toContain("scripts.db");
    const out = JSON.parse(fs.readFileSync(p, "utf8"));
    expect(out.scripts.dev).toBe("vite --host");
    expect(out.scripts.db).toBe("drizzle");
  });
});

describe("addPackageScript", () => {
  it("adds a script entry", () => {
    const p = writePkg({ name: "x" });
    addPackageScript(p, "db:migrate", "drizzle-kit migrate");
    const out = JSON.parse(fs.readFileSync(p, "utf8"));
    expect(out.scripts["db:migrate"]).toBe("drizzle-kit migrate");
  });
});
