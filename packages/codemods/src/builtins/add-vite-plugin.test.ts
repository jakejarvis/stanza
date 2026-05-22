import { emptyManifest } from "@stanza/registry";
import { describe, expect, it, vi } from "vitest";

import { openProject, type CodemodContext, type Project } from "../index";
import addVitePlugin from "./add-vite-plugin";

const BASE_VITE_CONFIG = `import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart(), react()],
});
`;

const MULTILINE_VITE_CONFIG = `import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart(),
    react(),
  ],
});
`;

/**
 * Spin up a ts-morph project with a single in-memory vite.config.ts at the
 * given content, plus a mock `CodemodContext` that records claimed regions.
 * The codemod's `ctx.project()` factory returns our project; `appRoot` is
 * a synthetic path that lines up with the in-memory file's directory.
 */
function setup(initial: string = BASE_VITE_CONFIG) {
  const seed = openProject("/repo/apps/web");
  // openProject without a tsconfig falls back to a real fs project, override
  // with a fresh in-memory one for tests.
  const inMem: Project = new (seed.constructor as new (opts: Record<string, unknown>) => Project)({
    useInMemoryFileSystem: true,
  });
  const sf = inMem.createSourceFile("/repo/apps/web/vite.config.ts", initial);

  const claimed: Array<{ file: string; region: string }> = [];
  const released: Array<{ file: string; region: string }> = [];

  const manifest = emptyManifest({ name: "t" });
  const ctx: CodemodContext = {
    projectRoot: "/repo",
    appRoot: "/repo/apps/web",
    project: () => inMem,
    manifest,
    owner: { category: "styling", module: "tailwind" },
    adapter: "default",
    claimRegion(file, region) {
      claimed.push({ file, region });
    },
    releaseRegion(file, region) {
      released.push({ file, region });
    },
  };

  return { ctx, sf, project: inMem, claimed, released };
}

const TAILWIND_ARGS = {
  call: "tailwindcss()",
  importFrom: "@tailwindcss/vite",
  importName: "tailwindcss",
  importKind: "default" as const,
  position: "before:react" as const,
};

describe("add-vite-plugin", () => {
  it("inserts the import and plugin call at the anchored position", () => {
    const { ctx, sf, claimed } = setup();
    const result = addVitePlugin.apply(ctx, TAILWIND_ARGS) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual(["apps/web/vite.config.ts"]);

    const text = sf.getFullText();
    expect(text).toContain(`import tailwindcss from "@tailwindcss/vite"`);
    // tailwindcss should land between tanstackStart() and react()
    const plugins = text.match(/plugins:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    expect(plugins.indexOf("tailwindcss()")).toBeGreaterThan(plugins.indexOf("tanstackStart()"));
    expect(plugins.indexOf("tailwindcss()")).toBeLessThan(plugins.indexOf("react()"));

    expect(claimed).toEqual([
      { file: "apps/web/vite.config.ts", region: "vite.plugins.tailwindcss" },
    ]);
  });

  it("appends at end when position is 'end'", () => {
    const { ctx, sf } = setup();
    addVitePlugin.apply(ctx, { ...TAILWIND_ARGS, position: "end" });
    const plugins = sf.getFullText().match(/plugins:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    expect(plugins.indexOf("tailwindcss()")).toBeGreaterThan(plugins.indexOf("react()"));
  });

  it("prepends at start when position is 'start'", () => {
    const { ctx, sf } = setup();
    addVitePlugin.apply(ctx, { ...TAILWIND_ARGS, position: "start" });
    const plugins = sf.getFullText().match(/plugins:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    expect(plugins.indexOf("tailwindcss()")).toBeLessThan(plugins.indexOf("tanstackStart()"));
  });

  it("falls back to end and warns when the anchor is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ctx, sf } = setup();
    addVitePlugin.apply(ctx, { ...TAILWIND_ARGS, position: "before:nonexistent" });
    const plugins = sf.getFullText().match(/plugins:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    expect(plugins.indexOf("tailwindcss()")).toBeGreaterThan(plugins.indexOf("react()"));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("is idempotent on re-apply", () => {
    const { ctx, sf } = setup();
    addVitePlugin.apply(ctx, TAILWIND_ARGS);
    const after1 = sf.getFullText();
    const result2 = addVitePlugin.apply(ctx, TAILWIND_ARGS) as { touchedFiles: string[] };
    expect(result2.touchedFiles).toEqual([]);
    expect(sf.getFullText()).toBe(after1);
  });

  it("revert removes the plugin call and import", () => {
    const { ctx, sf, released } = setup();
    addVitePlugin.apply(ctx, TAILWIND_ARGS);
    const after = sf.getFullText();
    expect(after).toContain("tailwindcss()");
    addVitePlugin.revert!(ctx, TAILWIND_ARGS);
    const reverted = sf.getFullText();
    expect(reverted).not.toContain("tailwindcss()");
    expect(reverted).not.toContain("@tailwindcss/vite");
    expect(released).toEqual([
      { file: "apps/web/vite.config.ts", region: "vite.plugins.tailwindcss" },
    ]);
  });

  it("supports named imports", () => {
    const { ctx, sf } = setup();
    addVitePlugin.apply(ctx, {
      call: "devtools()",
      importFrom: "@tanstack/devtools-vite",
      importName: "devtools",
      importKind: "named",
      position: "end",
    });
    expect(sf.getFullText()).toContain(`import { devtools } from "@tanstack/devtools-vite"`);
  });

  it("throws when the default export isn't defineConfig({plugins: [...]})", () => {
    const { ctx } = setup(`export default {};\n`);
    expect(() => addVitePlugin.apply(ctx, TAILWIND_ARGS)).toThrow(/default export isn't a call/);
  });

  it("throws when plugins is missing or not an array literal", () => {
    const { ctx } = setup(
      `import { defineConfig } from "vite";\nexport default defineConfig({ plugins: existing });\n`,
    );
    expect(() => addVitePlugin.apply(ctx, TAILWIND_ARGS)).toThrow(/needs a .*array literal/);
  });

  it("preserves the existing indent when inserting into a multi-line array", () => {
    const { ctx, sf } = setup(MULTILINE_VITE_CONFIG);
    addVitePlugin.apply(ctx, TAILWIND_ARGS);
    const text = sf.getFullText();
    // All three elements should share the same 4-space indent — earlier regression
    // had ts-morph's default 4-space-per-level reformat the inserted+following
    // elements to 8 spaces while leaving the first element at 4.
    expect(text).toContain(
      ["  plugins: [", "    tanstackStart(),", "    tailwindcss(),", "    react(),", "  ],"].join(
        "\n",
      ),
    );
  });

  it("lets two modules insert different plugins without colliding", () => {
    const { ctx, sf, claimed } = setup();
    addVitePlugin.apply(ctx, TAILWIND_ARGS);
    addVitePlugin.apply(ctx, {
      call: "devtools()",
      importFrom: "@tanstack/devtools-vite",
      importName: "devtools",
      importKind: "named",
      position: "end",
    });
    const text = sf.getFullText();
    expect(text).toContain("tailwindcss()");
    expect(text).toContain("devtools()");
    expect(claimed.map((c) => c.region)).toEqual([
      "vite.plugins.tailwindcss",
      "vite.plugins.devtools",
    ]);
  });
});
