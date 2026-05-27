import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, beforeEach } from "vite-plus/test";

import {
  addPackageDependency,
  addPackageScript,
  mergeJson,
  removePackageDependency,
  setJsonPath,
  setJsonPathSegments,
  unsetJsonPathSegments,
} from "./json";

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

describe("format preservation (JSONC)", () => {
  it("keeps comments + trailing commas through a setJsonPath edit", () => {
    const p = path.join(tmp, "tsconfig.json");
    fs.writeFileSync(
      p,
      `{
  // Editor hints
  "compilerOptions": {
    "strict": true, // load-bearing
  },
}
`,
    );
    setJsonPath(p, "compilerOptions.target", "ES2022");
    const text = fs.readFileSync(p, "utf8");
    expect(text).toContain("// Editor hints");
    expect(text).toContain("// load-bearing");
    expect(text).toContain('"target": "ES2022"');
  });

  it("preserves user key ordering when adding a dep", () => {
    const p = writePkg({
      name: "x",
      // Intentional ordering — keys would be alphabetized by a JSON.stringify
      // round-trip but jsonc-parser appends rather than rebuilds.
      version: "0.0.0",
      dependencies: { react: "^18", zustand: "^4" },
    });
    addPackageDependency(p, "better-auth", "^1.0.0");
    const text = fs.readFileSync(p, "utf8");
    expect(text.indexOf('"version"')).toBeLessThan(text.indexOf('"dependencies"'));
    // New dep lands after the existing ones, not interleaved alphabetically.
    expect(text.indexOf('"react"')).toBeLessThan(text.indexOf('"better-auth"'));
    expect(text.indexOf('"zustand"')).toBeLessThan(text.indexOf('"better-auth"'));
  });

  it("setJsonPathSegments handles keys containing `.` (tsconfig paths aliases)", () => {
    const p = writePkg({ compilerOptions: { paths: {} } });
    setJsonPathSegments(p, ["compilerOptions", "paths", "@acme/ui.next/*"], ["./src/*"]);
    const out = JSON.parse(fs.readFileSync(p, "utf8"));
    expect(out.compilerOptions.paths["@acme/ui.next/*"]).toEqual(["./src/*"]);
  });

  it("unsetJsonPathSegments no-ops on a missing parent key", () => {
    const p = writePkg({ name: "x" });
    // devDependencies doesn't exist — should not throw.
    expect(() => unsetJsonPathSegments(p, ["devDependencies", "vitest"])).not.toThrow();
  });
});
