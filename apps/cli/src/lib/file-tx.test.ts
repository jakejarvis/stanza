import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { FileTx } from "./file-tx";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-tx-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("FileTx", () => {
  it("restores a pre-existing file's content on rollback", () => {
    const file = path.join(tmp, "a.txt");
    fs.writeFileSync(file, "original");
    const tx = new FileTx();
    tx.snapshot(file);
    fs.writeFileSync(file, "modified");
    tx.rollback();
    expect(fs.readFileSync(file, "utf8")).toBe("original");
  });

  it("deletes a newly-created file on rollback", () => {
    const file = path.join(tmp, "new.txt");
    const tx = new FileTx();
    tx.snapshot(file); // didn't exist
    fs.writeFileSync(file, "created");
    tx.rollback();
    expect(fs.existsSync(file)).toBe(false);
  });

  it("captures only the first snapshot of a path (pre-transaction state)", () => {
    const file = path.join(tmp, "a.txt");
    fs.writeFileSync(file, "v1");
    const tx = new FileTx();
    tx.snapshot(file);
    fs.writeFileSync(file, "v2");
    tx.snapshot(file); // ignored — first capture (v1) wins
    fs.writeFileSync(file, "v3");
    tx.rollback();
    expect(fs.readFileSync(file, "utf8")).toBe("v1");
  });

  it("is idempotent — a second rollback is a no-op", () => {
    const file = path.join(tmp, "a.txt");
    fs.writeFileSync(file, "original");
    const tx = new FileTx();
    tx.snapshot(file);
    fs.writeFileSync(file, "modified");
    tx.rollback();
    // Re-dirty the file; a second rollback must NOT touch it.
    fs.writeFileSync(file, "later");
    tx.rollback();
    expect(fs.readFileSync(file, "utf8")).toBe("later");
  });
});
