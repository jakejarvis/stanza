import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { addEnvVar, removeEnvVar } from "./env.ts";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-test-"));
});

function envFile(initial: string): string {
  const p = path.join(tmp, ".env.example");
  fs.writeFileSync(p, initial);
  return p;
}

describe("addEnvVar", () => {
  it("creates the file if missing", () => {
    const p = path.join(tmp, ".env.example");
    addEnvVar(p, "DATABASE_URL", "postgres://localhost/db");
    expect(fs.readFileSync(p, "utf8")).toMatch(/DATABASE_URL=postgres/);
  });

  it("appends to an existing file", () => {
    const p = envFile("FOO=bar\n");
    addEnvVar(p, "BAZ", "qux");
    const out = fs.readFileSync(p, "utf8");
    expect(out).toContain("FOO=bar");
    expect(out).toContain("BAZ=qux");
  });

  it("is idempotent (updates in place rather than appending)", () => {
    const p = envFile("FOO=bar\n");
    addEnvVar(p, "FOO", "baz");
    const out = fs.readFileSync(p, "utf8");
    expect(out).toBe("FOO=baz\n");
  });
});

describe("removeEnvVar", () => {
  it("removes the entry and an attached preceding comment", () => {
    const p = envFile("# the foo\nFOO=bar\nKEEP=me\n");
    removeEnvVar(p, "FOO");
    const out = fs.readFileSync(p, "utf8");
    expect(out).not.toContain("FOO");
    expect(out).not.toContain("# the foo");
    expect(out).toContain("KEEP=me");
  });
});
