import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { emptyManifest } from "@withstanza/schema";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { type CodemodContext, openProject } from "../index";
import addJsxChild from "./add-jsx-child";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stanza-add-jsx-child-"));
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

const STARTER_PAGE = `export default function Page() {
  return (
    <main>
      <h1>Welcome to Stanza</h1>
      <p>Edit <code>app/page.tsx</code> to get started.</p>
    </main>
  );
}
`;

describe("add-jsx-child", () => {
  it("appends an element to a parent's children with imports", () => {
    const { ctx, abs, project } = setup("app/page.tsx", STARTER_PAGE);
    const result = addJsxChild.apply(ctx, {
      file: "app/page.tsx",
      parent: "main",
      element: "<ThemeToggle />",
      imports: [{ from: "@/components/theme-toggle", named: ["ThemeToggle"] }],
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual(["apps/web/app/page.tsx"]);
    project.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    expect(text).toContain('import { ThemeToggle } from "@/components/theme-toggle"');
    expect(text).toContain("<ThemeToggle />");
    // Comes after the existing <p>:
    const pIdx = text.indexOf("</p>");
    const ttIdx = text.indexOf("<ThemeToggle />");
    expect(ttIdx).toBeGreaterThan(pIdx);
  });

  it("inserts at start when position is 'start'", () => {
    const { ctx, abs, project } = setup("app/page.tsx", STARTER_PAGE);
    addJsxChild.apply(ctx, {
      file: "app/page.tsx",
      parent: "main",
      element: "<ThemeToggle />",
      position: "start",
      imports: [{ from: "@/components/theme-toggle", named: ["ThemeToggle"] }],
    });
    project.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    const h1Idx = text.indexOf("<h1>");
    const ttIdx = text.indexOf("<ThemeToggle />");
    expect(ttIdx).toBeLessThan(h1Idx);
  });

  it("inserts into an empty parent element", () => {
    const initial = `export default function Page() {
  return <main></main>;
}
`;
    const { ctx, abs, project } = setup("app/page.tsx", initial);
    addJsxChild.apply(ctx, {
      file: "app/page.tsx",
      parent: "main",
      element: "<ThemeToggle />",
      imports: [{ from: "@/components/theme-toggle", named: ["ThemeToggle"] }],
    });
    project.saveSync();
    expect(fs.readFileSync(abs, "utf8")).toContain("<ThemeToggle />");
  });

  it("skips when onlyIfContains doesn't match (user-customized file)", () => {
    const customized = `export default function Page() {
  return (
    <main>
      <h1>My App</h1>
    </main>
  );
}
`;
    const { ctx, abs } = setup("app/page.tsx", customized);
    const result = addJsxChild.apply(ctx, {
      file: "app/page.tsx",
      parent: "main",
      element: "<ThemeToggle />",
      onlyIfContains: ["Welcome to Stanza"],
      imports: [{ from: "@/components/theme-toggle", named: ["ThemeToggle"] }],
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual([]);
    expect(fs.readFileSync(abs, "utf8")).toBe(customized);
  });

  it("applies when onlyIfContains matches", () => {
    const { ctx, abs, project } = setup("app/page.tsx", STARTER_PAGE);
    addJsxChild.apply(ctx, {
      file: "app/page.tsx",
      parent: "main",
      element: "<ThemeToggle />",
      onlyIfContains: ["Welcome to Stanza"],
      imports: [{ from: "@/components/theme-toggle", named: ["ThemeToggle"] }],
    });
    project.saveSync();
    expect(fs.readFileSync(abs, "utf8")).toContain("<ThemeToggle />");
  });

  it("is idempotent when the element is already present", () => {
    const initial = STARTER_PAGE.replace("</main>", "  <ThemeToggle />\n    </main>");
    const { ctx, project } = setup("app/page.tsx", initial);
    const result = addJsxChild.apply(ctx, {
      file: "app/page.tsx",
      parent: "main",
      element: "<ThemeToggle />",
    }) as { touchedFiles: string[] };
    expect(result.touchedFiles).toEqual([]);
    project.saveSync();
  });

  it("throws when the parent JSX element isn't found", () => {
    const { ctx } = setup(
      "app/page.tsx",
      `export default function Page() { return <div>nope</div>; }\n`,
    );
    expect(() =>
      addJsxChild.apply(ctx, {
        file: "app/page.tsx",
        parent: "main",
        element: "<ThemeToggle />",
      }),
    ).toThrow(/no <main> JSX element/);
  });

  it("revert removes both the element and its import", () => {
    const { ctx, abs, project } = setup("app/page.tsx", STARTER_PAGE);
    addJsxChild.apply(ctx, {
      file: "app/page.tsx",
      parent: "main",
      element: "<ThemeToggle />",
      imports: [{ from: "@/components/theme-toggle", named: ["ThemeToggle"] }],
    });
    project.saveSync();

    const project2 = openProject(path.join(tmp, "apps/web"));
    addJsxChild.revert?.(
      { ...ctx, project: () => project2 },
      {
        file: "app/page.tsx",
        parent: "main",
        element: "<ThemeToggle />",
        imports: [{ from: "@/components/theme-toggle", named: ["ThemeToggle"] }],
      },
    );
    project2.saveSync();
    const text = fs.readFileSync(abs, "utf8");
    expect(text).not.toContain("ThemeToggle");
  });
});
