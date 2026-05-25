import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { emptyManifest } from "@stanza/registry";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { type CodemodContext, openProject } from "../index";
import addArrayEntryInCall from "./add-array-entry-in-call";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-aae-"));
  fs.mkdirSync(path.join(tmp, "apps/web/src/routes"), { recursive: true });
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
    adapter: "tanstack-start",
    claimRegion() {},
    releaseRegion() {},
  };
  return { ctx, abs, project };
}

const ROOT_WITH_HEAD = `import { createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "App" }],
    links: [],
  }),
  component: () => null,
});
`;

const ROOT_WITHOUT_HEAD = `import { Outlet, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <html lang="en">
      <body>
        <Outlet />
      </body>
    </html>
  ),
});
`;

describe("add-array-entry-in-call", () => {
  it("splices an entry into a nested array via arrow-returned object", () => {
    const { ctx, abs, project } = setup("src/routes/__root.tsx", ROOT_WITH_HEAD);
    const result = addArrayEntryInCall.apply(ctx, {
      file: "src/routes/__root.tsx",
      callee: "createRootRoute",
      property: "head().links",
      entry: '{ rel: "stylesheet", href: appCss }',
      imports: [{ from: "@acme/ui/globals.css?url", default: "appCss" }],
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual(["apps/web/src/routes/__root.tsx"]);
    project.saveSync();

    const text = fs.readFileSync(abs, "utf8");
    expect(text).toContain('import appCss from "@acme/ui/globals.css?url"');
    expect(text).toContain('{ rel: "stylesheet", href: appCss }');
  });

  it("creates missing intermediate `head: () => ({})` + `links: []`", () => {
    const { ctx, abs, project } = setup("src/routes/__root.tsx", ROOT_WITHOUT_HEAD);
    addArrayEntryInCall.apply(ctx, {
      file: "src/routes/__root.tsx",
      callee: "createRootRoute",
      property: "head().links",
      entry: '{ rel: "stylesheet", href: appCss }',
      imports: [{ from: "@acme/ui/globals.css?url", default: "appCss" }],
    });
    project.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    expect(text).toContain("head: () => ({");
    expect(text).toContain('links: [{ rel: "stylesheet", href: appCss }]');
  });

  it("is idempotent on re-apply", () => {
    const { ctx, project } = setup("src/routes/__root.tsx", ROOT_WITH_HEAD);
    addArrayEntryInCall.apply(ctx, {
      file: "src/routes/__root.tsx",
      callee: "createRootRoute",
      property: "head().links",
      entry: '{ rel: "stylesheet", href: appCss }',
    });
    project.saveSync();

    const project2 = openProject(path.join(tmp, "apps/web"));
    const result = addArrayEntryInCall.apply(
      { ...ctx, project: () => project2 },
      {
        file: "src/routes/__root.tsx",
        callee: "createRootRoute",
        property: "head().links",
        entry: '{ rel: "stylesheet", href: appCss }',
      },
    ) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual([]);
  });

  it("handles flat (non-call) nested path", () => {
    const initial = `import { defineConfig } from "vite";
export default defineConfig({
  build: { lib: { entry: "src/index.ts" }, deps: [] },
});
`;
    const { ctx, abs, project } = setup("vite.config.ts", initial);
    addArrayEntryInCall.apply(ctx, {
      file: "vite.config.ts",
      callee: "defineConfig",
      property: "build.deps",
      entry: '"foo"',
    });
    project.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    expect(text).toContain('deps: ["foo"]');
  });

  it("revert removes the entry and import", () => {
    const { ctx, abs, project } = setup("src/routes/__root.tsx", ROOT_WITH_HEAD);
    addArrayEntryInCall.apply(ctx, {
      file: "src/routes/__root.tsx",
      callee: "createRootRoute",
      property: "head().links",
      entry: '{ rel: "stylesheet", href: appCss }',
      imports: [{ from: "@acme/ui/globals.css?url", default: "appCss" }],
    });
    project.saveSync();

    const project2 = openProject(path.join(tmp, "apps/web"));
    addArrayEntryInCall.revert?.(
      { ...ctx, project: () => project2 },
      {
        file: "src/routes/__root.tsx",
        callee: "createRootRoute",
        property: "head().links",
        entry: '{ rel: "stylesheet", href: appCss }',
        imports: [{ from: "@acme/ui/globals.css?url", default: "appCss" }],
      },
    );
    project2.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    expect(text).not.toContain("appCss");
    expect(text).not.toContain("@acme/ui/globals.css");
  });
});
