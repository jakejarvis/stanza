import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { emptyManifest, type StanzaManifest } from "@stanza/registry";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { type CodemodContext, openProject } from "../index";
import wrapRootLayout from "./wrap-root-layout";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-wrap-root-"));
  fs.mkdirSync(path.join(tmp, "apps/web"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function withFramework(id: string): StanzaManifest {
  const manifest = emptyManifest({ name: "acme" });
  return {
    ...manifest,
    modules: {
      framework: [{ id, version: "0.1.0", adapter: "default", apps: ["web"] }],
    },
  };
}

function setup(
  filePath: string,
  initial: string,
  manifest: StanzaManifest = withFramework("next"),
) {
  const abs = path.join(tmp, "apps/web", filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, initial, "utf8");
  const project = openProject(path.join(tmp, "apps/web"));
  const claimed: Array<{ file: string; region: string }> = [];
  const released: Array<{ file: string; region: string }> = [];
  const ctx: CodemodContext = {
    projectRoot: tmp,
    app: manifest.apps[0]!,
    appRoot: path.join(tmp, "apps/web"),
    project: () => project,
    manifest,
    owner: { category: "auth", module: "clerk" },
    adapter: "default",
    claimRegion(file, region) {
      claimed.push({ file, region });
    },
    releaseRegion(file, region) {
      released.push({ file, region });
    },
  };
  return { ctx, abs, project, claimed, released };
}

const NEXT_LAYOUT = `import type { ReactNode } from "react";

import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

const TANSTACK_ROOT = `import { Outlet, createRootRoute } from "@tanstack/react-router";

import "../globals.css";

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

describe("wrap-root-layout", () => {
  describe("next dispatch", () => {
    it("wraps {children} and adds a named import", () => {
      const { ctx, abs, project, claimed } = setup("app/layout.tsx", NEXT_LAYOUT);
      const result = wrapRootLayout.apply(ctx, {
        providerName: "ClerkProvider",
        providerImport: "@clerk/nextjs",
      }) as { touchedFiles: string[] };

      expect(result.touchedFiles).toEqual(["apps/web/app/layout.tsx"]);
      project.saveSync();
      const text = fs.readFileSync(abs, "utf8");
      expect(text).toContain('import { ClerkProvider } from "@clerk/nextjs"');
      expect(text).toContain("<ClerkProvider>{children}</ClerkProvider>");
      expect(claimed).toEqual([
        { file: "apps/web/app/layout.tsx", region: "imports.ClerkProvider" },
        { file: "apps/web/app/layout.tsx", region: "providers.ClerkProvider" },
      ]);
    });

    it("supports default-import kind", () => {
      const { ctx, abs, project } = setup("app/layout.tsx", NEXT_LAYOUT);
      wrapRootLayout.apply(ctx, {
        providerName: "Providers",
        providerImport: "./providers",
        importKind: "default",
      });
      project.saveSync();
      const text = fs.readFileSync(abs, "utf8");
      expect(text).toContain('import Providers from "./providers"');
      expect(text).toContain("<Providers>{children}</Providers>");
    });

    it("is idempotent on re-apply", () => {
      const { ctx, project } = setup("app/layout.tsx", NEXT_LAYOUT);
      wrapRootLayout.apply(ctx, {
        providerName: "ClerkProvider",
        providerImport: "@clerk/nextjs",
      });
      project.saveSync();

      const project2 = openProject(path.join(tmp, "apps/web"));
      const result = wrapRootLayout.apply(
        { ...ctx, project: () => project2 },
        { providerName: "ClerkProvider", providerImport: "@clerk/nextjs" },
      ) as { touchedFiles: string[] };
      expect(result.touchedFiles).toEqual([]);
    });

    it("throws when the {children} marker is missing", () => {
      const customized = `export default function RootLayout() { return <html><body /></html>; }\n`;
      const { ctx } = setup("app/layout.tsx", customized);
      expect(() =>
        wrapRootLayout.apply(ctx, {
          providerName: "ClerkProvider",
          providerImport: "@clerk/nextjs",
        }),
      ).toThrow(/could not find `{children}`/);
    });
  });

  describe("tanstack-start dispatch", () => {
    it("wraps <Outlet /> and adds a named import", () => {
      const { ctx, abs, project, claimed } = setup(
        "src/routes/__root.tsx",
        TANSTACK_ROOT,
        withFramework("tanstack-start"),
      );
      wrapRootLayout.apply(ctx, {
        providerName: "ThemeProvider",
        providerImport: "@/components/theme-provider",
      });
      project.saveSync();
      const text = fs.readFileSync(abs, "utf8");
      expect(text).toContain('import { ThemeProvider } from "@/components/theme-provider"');
      expect(text).toContain("<ThemeProvider><Outlet /></ThemeProvider>");
      expect(claimed).toEqual([
        { file: "apps/web/src/routes/__root.tsx", region: "imports.ThemeProvider" },
        { file: "apps/web/src/routes/__root.tsx", region: "providers.ThemeProvider" },
      ]);
    });
  });

  describe("unsupported framework", () => {
    it("throws with a helpful message", () => {
      const { ctx } = setup("app/layout.tsx", NEXT_LAYOUT, withFramework("solid-start"));
      expect(() =>
        wrapRootLayout.apply(ctx, {
          providerName: "ClerkProvider",
          providerImport: "@clerk/nextjs",
        }),
      ).toThrow(/framework "solid-start" not supported/);
    });

    it("throws when no framework is selected at all", () => {
      const { ctx } = setup("app/layout.tsx", NEXT_LAYOUT, emptyManifest({ name: "acme" }));
      expect(() =>
        wrapRootLayout.apply(ctx, {
          providerName: "ClerkProvider",
          providerImport: "@clerk/nextjs",
        }),
      ).toThrow(/framework "<unset>" not supported/);
    });
  });

  describe("revert", () => {
    it("removes the wrapper and import", () => {
      const { ctx, abs, project, released } = setup("app/layout.tsx", NEXT_LAYOUT);
      wrapRootLayout.apply(ctx, {
        providerName: "ClerkProvider",
        providerImport: "@clerk/nextjs",
      });
      project.saveSync();
      const project2 = openProject(path.join(tmp, "apps/web"));
      wrapRootLayout.revert?.(
        { ...ctx, project: () => project2 },
        { providerName: "ClerkProvider", providerImport: "@clerk/nextjs" },
      );
      project2.saveSync();
      const text = fs.readFileSync(abs, "utf8");
      expect(text).not.toContain("ClerkProvider");
      expect(text).toContain("<body>{children}</body>");
      expect(released).toEqual([
        { file: "apps/web/app/layout.tsx", region: "imports.ClerkProvider" },
        { file: "apps/web/app/layout.tsx", region: "providers.ClerkProvider" },
      ]);
    });

    it("revert is a no-op on an unsupported framework", () => {
      const { ctx } = setup("app/layout.tsx", NEXT_LAYOUT, withFramework("solid-start"));
      const result = wrapRootLayout.revert?.(ctx, {
        providerName: "ClerkProvider",
        providerImport: "@clerk/nextjs",
      });
      expect(result).toEqual({ touchedFiles: [] });
    });
  });
});
