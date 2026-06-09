import { describe, expect, it } from "vite-plus/test";

import { appendEnvVar, safeEnvName, safeEnvValue } from "./env";

describe("safeEnvName", () => {
  it("accepts dotenv/shell keys", () => {
    expect(safeEnvName("DATABASE_URL")).toBeNull();
    expect(safeEnvName("_PRIVATE")).toBeNull();
    expect(safeEnvName("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")).toBeNull();
    expect(safeEnvName("A1")).toBeNull();
  });

  it("rejects empty names", () => {
    expect(safeEnvName("")).toMatch(/empty/);
  });

  it("rejects names that don't match the key pattern", () => {
    expect(safeEnvName("1LEADING_DIGIT")).toMatch(/match/);
    expect(safeEnvName("HAS-DASH")).toMatch(/match/);
    expect(safeEnvName("HAS.DOT")).toMatch(/match/);
    expect(safeEnvName("HAS SPACE")).toMatch(/match/);
    expect(safeEnvName("HAS=EQUALS")).toMatch(/match/);
  });

  it("rejects newline injection in the name", () => {
    expect(safeEnvName("FOO\nMALICIOUS")).toMatch(/match/);
  });
});

describe("safeEnvValue", () => {
  it("accepts ordinary example values", () => {
    expect(safeEnvValue("postgres://postgres:postgres@localhost:5432/db")).toBeNull();
    expect(safeEnvValue("sk-...")).toBeNull();
    expect(safeEnvValue("")).toBeNull();
    expect(safeEnvValue("with spaces, punctuation: ok!")).toBeNull();
  });

  it("rejects control characters / newlines", () => {
    expect(safeEnvValue("\nBAR=baz")).toMatch(/control/);
    expect(safeEnvValue("a\rb")).toMatch(/control/);
    expect(safeEnvValue("a\tb")).toMatch(/control/);
    expect(safeEnvValue("a\0b")).toMatch(/control/);
  });
});

describe("appendEnvVar", () => {
  it("appends a new var after existing content with a blank-line separator", () => {
    expect(appendEnvVar("FOO=1", "BAR", "2")).toBe("FOO=1\n\nBAR=2");
  });

  it("appends a leading description comment", () => {
    expect(appendEnvVar("", "BAR", "2", "the bar")).toBe("\n# the bar\nBAR=2");
  });

  it("updates an existing var in place (idempotent)", () => {
    const once = appendEnvVar("# the bar\nBAR=old\n", "BAR", "new", "the bar");
    expect(once).toBe("# the bar\nBAR=new\n");
    // Re-applying the same write is a no-op.
    expect(appendEnvVar(once, "BAR", "new", "the bar")).toBe(once);
  });

  it("rejects a name containing a newline", () => {
    expect(() => appendEnvVar("", "FOO\nMALICIOUS", "x")).toThrow(/name/);
  });

  it("rejects an example containing a newline", () => {
    expect(() => appendEnvVar("", "FOO", "\nBAR=baz")).toThrow(/control/);
  });

  it("rejects a description containing a newline", () => {
    expect(() => appendEnvVar("", "FOO", "x", "ok\nEVIL=1")).toThrow(/control/);
  });
});
