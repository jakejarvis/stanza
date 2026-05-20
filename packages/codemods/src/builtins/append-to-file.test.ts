import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { emptyManifest } from "@stanza/registry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openProject, type CodemodContext, type Project } from "../index";
import appendToFile from "./append-to-file";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-append-"));
  fs.mkdirSync(path.join(tmp, "apps/web"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function setup(filePath: string, initial: string) {
  const abs = path.join(tmp, "apps/web", filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, initial, "utf8");

  // The codemod doesn't actually use ts-morph (text-level append), but we
  // still need a Project for the ctx; pass an in-memory throwaway.
  const seed = openProject(path.join(tmp, "apps/web"));
  const inMem: Project = new (seed.constructor as new (opts: Record<string, unknown>) => Project)({
    useInMemoryFileSystem: true,
  });

  const claimed: Array<{ file: string; region: string }> = [];
  const released: Array<{ file: string; region: string }> = [];
  const manifest = emptyManifest({ name: "t" });

  const ctx: CodemodContext = {
    projectRoot: tmp,
    appRoot: path.join(tmp, "apps/web"),
    project: () => inMem,
    manifest,
    owner: { slot: "auth", module: "better-auth" },
    adapter: "default",
    claimRegion(file, region) {
      claimed.push({ file, region });
    },
    releaseRegion(file, region) {
      released.push({ file, region });
    },
  };
  return { ctx, abs, claimed, released };
}

const PRISMA_INITIAL = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

const PRISMA_MODELS = `model User {
  id    String @id
  email String @unique
}

model Session {
  id     String @id
  userId String
}`;

describe("append-to-file", () => {
  it("wraps content with marker comments and appends to a Prisma schema", () => {
    const { ctx, abs, claimed } = setup("prisma/schema.prisma", PRISMA_INITIAL);
    const result = appendToFile.apply(ctx, {
      file: "prisma/schema.prisma",
      content: PRISMA_MODELS,
      marker: "better-auth-models",
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual(["apps/web/prisma/schema.prisma"]);

    const text = fs.readFileSync(abs, "utf8");
    expect(text).toContain("// stanza:better-auth-models:start");
    expect(text).toContain("// stanza:better-auth-models:end");
    expect(text).toContain("model User");
    expect(text).toContain("model Session");
    expect(claimed).toEqual([
      { file: "apps/web/prisma/schema.prisma", region: "append.better-auth-models" },
    ]);
  });

  it("is idempotent on re-apply with identical content", () => {
    const { ctx, abs } = setup("prisma/schema.prisma", PRISMA_INITIAL);
    appendToFile.apply(ctx, {
      file: "prisma/schema.prisma",
      content: PRISMA_MODELS,
      marker: "better-auth-models",
    });
    const after1 = fs.readFileSync(abs, "utf8");
    const second = appendToFile.apply(ctx, {
      file: "prisma/schema.prisma",
      content: PRISMA_MODELS,
      marker: "better-auth-models",
    }) as { touchedFiles: string[] };
    expect(second.touchedFiles).toEqual([]);
    expect(fs.readFileSync(abs, "utf8")).toBe(after1);
  });

  it("throws when the same marker already has different content", () => {
    const { ctx } = setup("prisma/schema.prisma", PRISMA_INITIAL);
    appendToFile.apply(ctx, {
      file: "prisma/schema.prisma",
      content: PRISMA_MODELS,
      marker: "better-auth-models",
    });
    expect(() =>
      appendToFile.apply(ctx, {
        file: "prisma/schema.prisma",
        content: "model Different { id String @id }",
        marker: "better-auth-models",
      }),
    ).toThrow(/different content/);
  });

  it("revert removes exactly the marked block (and one leading blank)", () => {
    const { ctx, abs, released } = setup("prisma/schema.prisma", PRISMA_INITIAL);
    appendToFile.apply(ctx, {
      file: "prisma/schema.prisma",
      content: PRISMA_MODELS,
      marker: "better-auth-models",
    });
    appendToFile.revert!(ctx, {
      file: "prisma/schema.prisma",
      content: PRISMA_MODELS,
      marker: "better-auth-models",
    });
    expect(fs.readFileSync(abs, "utf8")).toBe(PRISMA_INITIAL);
    expect(released).toEqual([
      { file: "apps/web/prisma/schema.prisma", region: "append.better-auth-models" },
    ]);
  });

  it("infers /* */ for CSS files", () => {
    const { ctx, abs } = setup("src/globals.css", `@import "tailwindcss";\n`);
    appendToFile.apply(ctx, {
      file: "src/globals.css",
      content: `@import "shadcn/tailwind.css";`,
      marker: "shadcn-import",
    });
    const text = fs.readFileSync(abs, "utf8");
    expect(text).toContain("/* stanza:shadcn-import:start */");
    expect(text).toContain("/* stanza:shadcn-import:end */");
    expect(text).toContain(`@import "shadcn/tailwind.css";`);
  });

  it("infers # for YAML / dotfiles", () => {
    const { ctx, abs } = setup(".dockerignore", `node_modules\n`);
    appendToFile.apply(ctx, {
      file: ".dockerignore",
      content: "data/\n.output/",
      marker: "stanza-build",
    });
    expect(fs.readFileSync(abs, "utf8")).toContain("# stanza:stanza-build:start");
  });

  it("throws when the comment style can't be inferred and isn't provided", () => {
    const { ctx } = setup("data/random.bin", "binary\n");
    expect(() =>
      appendToFile.apply(ctx, {
        file: "data/random.bin",
        content: "anything",
        marker: "m",
      }),
    ).toThrow(/cannot infer a comment style/);
  });

  it("throws when the target file doesn't exist", () => {
    const { ctx } = setup("prisma/schema.prisma", PRISMA_INITIAL);
    expect(() =>
      appendToFile.apply(ctx, {
        file: "prisma/does-not-exist.prisma",
        content: "x",
        marker: "m",
      }),
    ).toThrow(/not found/);
  });

  it("lets two modules append distinct blocks to the same file", () => {
    const { ctx, abs, claimed } = setup("prisma/schema.prisma", PRISMA_INITIAL);
    appendToFile.apply(ctx, {
      file: "prisma/schema.prisma",
      content: "model User { id String @id }",
      marker: "auth-models",
    });
    appendToFile.apply(ctx, {
      file: "prisma/schema.prisma",
      content: "model AuditLog { id String @id }",
      marker: "audit-models",
    });
    const text = fs.readFileSync(abs, "utf8");
    expect(text).toContain("model User");
    expect(text).toContain("model AuditLog");
    expect(claimed.map((c) => c.region)).toEqual(["append.auth-models", "append.audit-models"]);
  });
});
