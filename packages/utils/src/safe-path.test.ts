import { describe, expect, it } from "vite-plus/test";

import { assertSafeRelativePath, safeRelativePath } from "./safe-path";

describe("safeRelativePath", () => {
  it("accepts simple relative paths", () => {
    expect(safeRelativePath("src/foo.ts")).toBeNull();
    expect(safeRelativePath("file.ts")).toBeNull();
    expect(safeRelativePath("a/b/c.tsx")).toBeNull();
    expect(safeRelativePath("./local.ts")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(safeRelativePath("")).toMatch(/empty/);
  });

  it("rejects POSIX-absolute paths", () => {
    expect(safeRelativePath("/etc/passwd")).toMatch(/relative/);
    expect(safeRelativePath("/")).toMatch(/relative/);
  });

  it("rejects Windows-style absolute paths", () => {
    expect(safeRelativePath("C:\\Windows\\System32")).toMatch(/relative/);
    expect(safeRelativePath("c:/windows")).toMatch(/relative/);
    expect(safeRelativePath("\\foo\\bar")).toMatch(/relative/);
  });

  it("rejects `..` segments anywhere in the path", () => {
    expect(safeRelativePath("..")).toMatch(/escape/);
    expect(safeRelativePath("../etc/passwd")).toMatch(/escape/);
    expect(safeRelativePath("a/../b")).toMatch(/escape/);
    expect(safeRelativePath("a/b/..")).toMatch(/escape/);
    // Windows separator variant.
    expect(safeRelativePath("..\\etc\\passwd")).toMatch(/escape/);
    expect(safeRelativePath("a\\..\\b")).toMatch(/escape/);
  });

  it("rejects null bytes", () => {
    expect(safeRelativePath("foo\0bar")).toMatch(/null/);
  });

  it("accepts paths with `..` as a substring of a segment (not as the segment)", () => {
    // `..tsx` is a legitimate (if unusual) filename, not a parent reference.
    expect(safeRelativePath("foo..bar")).toBeNull();
    expect(safeRelativePath("..foo")).toBeNull();
  });
});

describe("assertSafeRelativePath", () => {
  it("returns void for safe paths", () => {
    expect(() => assertSafeRelativePath("src/foo.ts", "test")).not.toThrow();
  });

  it("throws with the label for unsafe paths", () => {
    expect(() => assertSafeRelativePath("../../etc", "template dest")).toThrow(/template dest/);
    expect(() => assertSafeRelativePath("/abs/path", "args.file")).toThrow(/args\.file/);
  });
});
