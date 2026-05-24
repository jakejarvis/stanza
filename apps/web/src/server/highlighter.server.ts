import { LRUCache } from "lru-cache";
import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  type BundledTheme,
} from "shiki";

import type { Preview } from "@/server/highlighter";

/**
 * Languages we expect from the registry's templates. New module templates that
 * use a language outside this set will fall through to plaintext — add the
 * language here and rebuild.
 */
const LANGS = [
  "tsx",
  "ts",
  "json",
  "jsonc",
  "css",
  "html",
  "md",
  "mdx",
  "yaml",
  "bash",
  "shell",
  "prisma",
  "sql",
] as const satisfies readonly BundledLanguage[];

const THEMES = ["github-light", "github-dark"] as const satisfies readonly BundledTheme[];

let highlighterPromise: Promise<Highlighter> | undefined;

/**
 * Module-singleton Shiki highlighter. Keeps the grammar/theme load warm across
 * server function invocations on the same server instance. This whole module
 * runs server-side only — never imported from a client component.
 */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [...THEMES],
      langs: [...LANGS],
    });
  }
  return highlighterPromise;
}

const EXT_TO_LANG: Record<string, BundledLanguage> = {
  ts: "ts",
  tsx: "tsx",
  js: "ts",
  jsx: "tsx",
  mjs: "ts",
  cjs: "ts",
  json: "json",
  jsonc: "jsonc",
  css: "css",
  html: "html",
  md: "md",
  mdx: "mdx",
  yaml: "yaml",
  yml: "yaml",
  sh: "bash",
  bash: "bash",
  prisma: "prisma",
  sql: "sql",
  // anything else returns undefined → highlighter renders as plaintext
};

export function langForPath(path: string): BundledLanguage | undefined {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext];
}

/**
 * Render a single source string to a `{ light, dark }` pair of pre-themed HTML
 * blocks. The client renders one via dangerouslySetInnerHTML based on the
 * active theme.
 */
async function renderPreviewImpl(source: string, filePath: string): Promise<Preview> {
  const highlighter = await getHighlighter();
  const lang = langForPath(filePath) ?? "plaintext";
  return {
    light: highlighter.codeToHtml(source, { lang, theme: "github-light" }),
    dark: highlighter.codeToHtml(source, { lang, theme: "github-dark" }),
  };
}

// Memoize by (path, source). Path drives grammar selection via `langForPath`;
// source + grammar + the singleton theme set fully determine the HTML output.
const previewCache = new LRUCache<string, Preview>({ max: 500 });

export async function renderPreview(source: string, filePath: string): Promise<Preview> {
  const key = `${filePath}::${source}`;
  const hit = previewCache.get(key);
  if (hit) return hit;
  const fresh = await renderPreviewImpl(source, filePath);
  previewCache.set(key, fresh);
  return fresh;
}
