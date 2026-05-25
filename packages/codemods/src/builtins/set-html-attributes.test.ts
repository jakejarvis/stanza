import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { emptyManifest } from "@stanza/registry";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { type CodemodContext, openProject } from "../index";
import setHtmlAttributes from "./set-html-attributes";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-html-attrs-"));
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
  return { ctx, abs, project };
}

const LAYOUT_TSX = `import type { ReactNode } from "react";

import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

describe("set-html-attributes", () => {
  it("adds a boolean attribute (suppressHydrationWarning)", () => {
    const { ctx, abs, project } = setup("app/layout.tsx", LAYOUT_TSX);
    const result = setHtmlAttributes.apply(ctx, {
      file: "app/layout.tsx",
      attributes: [{ name: "suppressHydrationWarning", boolean: true }],
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual(["apps/web/app/layout.tsx"]);
    project.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    expect(text).toContain('<html lang="en" suppressHydrationWarning');
  });

  it("merges className tokens into an existing className string", () => {
    const initial = LAYOUT_TSX.replace(
      '<html lang="en">',
      '<html lang="en" className="antialiased">',
    );
    const { ctx, abs, project } = setup("app/layout.tsx", initial);
    setHtmlAttributes.apply(ctx, {
      file: "app/layout.tsx",
      attributes: [{ name: "className", value: "font-sans antialiased" }],
    });
    project.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    expect(text).toMatch(/className="antialiased font-sans"/);
  });

  it("adds className when missing", () => {
    const { ctx, abs, project } = setup("app/layout.tsx", LAYOUT_TSX);
    setHtmlAttributes.apply(ctx, {
      file: "app/layout.tsx",
      attributes: [{ name: "className", value: "antialiased font-sans" }],
    });
    project.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    expect(text).toMatch(/className="antialiased font-sans"/);
  });

  it("sets a JSX-expression attribute", () => {
    const { ctx, abs, project } = setup("app/layout.tsx", LAYOUT_TSX);
    setHtmlAttributes.apply(ctx, {
      file: "app/layout.tsx",
      attributes: [{ name: "className", expression: 'cn("antialiased", "font-sans")' }],
    });
    project.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    expect(text).toContain('className={cn("antialiased", "font-sans")}');
  });

  it("is idempotent when the boolean attr is already present", () => {
    const initial = LAYOUT_TSX.replace(
      '<html lang="en">',
      '<html lang="en" suppressHydrationWarning>',
    );
    const { ctx, abs, project } = setup("app/layout.tsx", initial);
    const result = setHtmlAttributes.apply(ctx, {
      file: "app/layout.tsx",
      attributes: [{ name: "suppressHydrationWarning", boolean: true }],
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual([]);
    project.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    // Only one occurrence.
    expect(text.match(/suppressHydrationWarning/g)?.length).toBe(1);
  });

  it("throws when no <html> element is present", () => {
    const { ctx } = setup("app/page.tsx", "export default function Page() { return null; }\n");
    expect(() =>
      setHtmlAttributes.apply(ctx, {
        file: "app/page.tsx",
        attributes: [{ name: "suppressHydrationWarning", boolean: true }],
      }),
    ).toThrow(/no top-level `<html …>`/);
  });
});
