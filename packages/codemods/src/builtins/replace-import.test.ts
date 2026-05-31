import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { emptyManifest } from "@withstanza/schema";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { type CodemodContext, openProject } from "../index";
import replaceImport from "./replace-import";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-replace-import-"));
  fs.mkdirSync(path.join(tmp, "apps/web/app"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function setup(filePath: string, initial: string) {
  const abs = path.join(tmp, "apps/web", filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, initial, "utf8");
  const project = openProject(path.join(tmp, "apps/web"));
  const claimed: Array<{ file: string; region: string }> = [];
  const released: Array<{ file: string; region: string }> = [];
  const manifest = emptyManifest({ name: "acme" });
  const ctx: CodemodContext = {
    projectRoot: tmp,
    app: manifest.apps[0]!,
    appRoot: path.join(tmp, "apps/web"),
    project: () => project,
    manifest,
    owner: { category: "ui", module: "shadcn-radix" },
    adapter: "next",
    claimRegion(file, region) {
      claimed.push({ file, region });
    },
    releaseRegion(file, region) {
      released.push({ file, region });
    },
  };
  return { ctx, abs, project, claimed, released };
}

const LAYOUT_TSX = `import type { ReactNode } from "react";

import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html><body>{children}</body></html>;
}
`;

describe("replace-import", () => {
  it("swaps a side-effect import's module specifier in place", () => {
    const { ctx, abs, project, claimed } = setup("app/layout.tsx", LAYOUT_TSX);
    const result = replaceImport.apply(ctx, {
      file: "app/layout.tsx",
      from: "./globals.css",
      to: "@acme/ui/globals.css",
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual(["apps/web/app/layout.tsx"]);
    project.saveSync();
    expect(fs.readFileSync(abs, "utf8")).toContain('import "@acme/ui/globals.css";');
    expect(fs.readFileSync(abs, "utf8")).not.toContain('import "./globals.css";');
    expect(claimed).toEqual([
      { file: "apps/web/app/layout.tsx", region: "imports.@acme/ui/globals.css" },
    ]);
  });

  it("is idempotent when the target import already exists", () => {
    const { ctx, project } = setup(
      "app/layout.tsx",
      LAYOUT_TSX.replace("./globals.css", "@acme/ui/globals.css"),
    );
    const result = replaceImport.apply(ctx, {
      file: "app/layout.tsx",
      from: "./globals.css",
      to: "@acme/ui/globals.css",
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual([]);
    project.saveSync();
  });

  it("throws when neither `from` nor `to` is present", () => {
    const { ctx } = setup("app/layout.tsx", LAYOUT_TSX.replace('import "./globals.css";\n\n', ""));
    expect(() =>
      replaceImport.apply(ctx, {
        file: "app/layout.tsx",
        from: "./globals.css",
        to: "@acme/ui/globals.css",
      }),
    ).toThrow(/no import from "\.\/globals\.css"/);
  });

  it("preserves the import's binding (named import)", () => {
    const initial = `import { foo } from "./oldmod";\n`;
    const { ctx, abs, project } = setup("app/x.ts", initial);
    replaceImport.apply(ctx, { file: "app/x.ts", from: "./oldmod", to: "./newmod" });
    project.saveSync();
    expect(fs.readFileSync(abs, "utf8")).toContain('import { foo } from "./newmod";');
  });

  it("revert swaps the specifier back", () => {
    const { ctx, abs, project } = setup("app/layout.tsx", LAYOUT_TSX);
    replaceImport.apply(ctx, {
      file: "app/layout.tsx",
      from: "./globals.css",
      to: "@acme/ui/globals.css",
    });
    project.saveSync();
    expect(fs.readFileSync(abs, "utf8")).toContain('import "@acme/ui/globals.css";');

    const project2 = openProject(path.join(tmp, "apps/web"));
    const ctx2: CodemodContext = { ...ctx, project: () => project2 };
    replaceImport.revert?.(ctx2, {
      file: "app/layout.tsx",
      from: "./globals.css",
      to: "@acme/ui/globals.css",
    });
    project2.saveSync();
    expect(fs.readFileSync(abs, "utf8")).toContain('import "./globals.css";');
  });
});
