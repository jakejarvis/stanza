import fs from "node:fs";
import path from "node:path";

import {
  addDefaultImport,
  addNamedImport,
  type Codemod,
  type ImportDeclaration,
  type JsxElement,
  type NamedImportSpec,
  type Node,
  type SourceFile,
  SyntaxKind,
} from "../index";

/**
 * Insert a JSX element as a child of a named parent JSX element — the canonical
 * use case is dropping a UI component like `<ThemeToggle />` into a starter
 * page's `<main>` after a UI module installs.
 *
 * **Untouched-file gate**: set `onlyIfContains` to a list of substrings that
 * must all appear in the file. If any are missing the codemod treats the file
 * as user-customized and skips silently — that's how we avoid stepping on a
 * hand-edited homepage. Pick something stable and unlikely to be removed (one
 * good string usually suffices, e.g. a starter heading).
 *
 * Idempotent: if the normalized form of `element` already appears anywhere in
 * the file, the codemod no-ops.
 */
export type AddJsxChildArgs = {
  /** Path to the file, relative to `base`. */
  file: string;
  /**
   * Where `file` resolves against:
   *  - `"repo"`: `ctx.projectRoot`
   *  - `"app"` (default): `ctx.appRoot`
   *  - `"package:<dir>"`: `<projectRoot>/packages/<dir>/`
   */
  base?: "app" | "repo" | `package:${string}`;
  /** Tag name of the parent JSX element to insert into (e.g. `"main"`, `"body"`). */
  parent: string;
  /** Verbatim JSX text of the element to insert, e.g. `"<ThemeToggle />"`. */
  element: string;
  /** Where to place the child — defaults to `"end"`. */
  position?: "start" | "end";
  /**
   * Imports to add. Same shape as `add-plugin-to-call`'s — named + default
   * merge into one declaration per module specifier.
   */
  imports?: Array<{
    from: string;
    named?: NamedImportSpec[];
    default?: string;
  }>;
  /**
   * Skip the codemod (treat the file as user-customized) when any of these
   * substrings is missing. Compared on the raw file text. Leave empty to
   * always apply.
   */
  onlyIfContains?: string[];
  /** Region key used to track ownership. Defaults to `jsx.<parent>.<element-prefix>`. */
  regionKey?: string;
};

const addJsxChild: Codemod<AddJsxChildArgs> = {
  id: "add-jsx-child",
  description: "Insert a JSX element as a child of a named parent JSX element.",

  apply(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    if (!fs.existsSync(abs)) {
      throw new Error(
        `add-jsx-child: ${rel} not found. ` +
          `This codemod modifies an existing file; ship the template first.`,
      );
    }

    // Untouched gate: skip silently if the file's fingerprint doesn't match.
    if (args.onlyIfContains && args.onlyIfContains.length > 0) {
      const text = fs.readFileSync(abs, "utf8");
      const missing = args.onlyIfContains.find((needle) => !text.includes(needle));
      if (missing !== undefined) {
        return { touchedFiles: [] };
      }
    }

    const sf = ctx.project().addSourceFileAtPath(abs);

    // Idempotency: same element already present anywhere in the file → no-op.
    const target = normalize(args.element);
    if (normalize(sf.getText()).includes(target)) {
      ctx.claimRegion(rel, regionKeyFor(args));
      return { touchedFiles: [] };
    }

    const parent = findFirstJsxElement(sf, args.parent);
    if (!parent) {
      throw new Error(
        `add-jsx-child: no <${args.parent}> JSX element in ${rel}. ` +
          `Check the parent tag, or add the element manually.`,
      );
    }

    addImports(sf, args.imports);
    insertChild(sf, parent, args.element, args.position ?? "end");
    ctx.claimRegion(rel, regionKeyFor(args));
    return { touchedFiles: [rel] };
  },

  revert(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    if (!fs.existsSync(abs)) {
      ctx.releaseRegion(rel, regionKeyFor(args));
      return { touchedFiles: [] };
    }
    const sf = ctx.project().addSourceFileAtPath(abs);
    const target = normalize(args.element);

    let changed = false;
    for (const node of sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
      if (normalize(node.getText()) === target) {
        node.replaceWithText("");
        changed = true;
        break;
      }
    }
    if (!changed) {
      for (const node of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
        if (normalize(node.getText()) === target) {
          node.replaceWithText("");
          changed = true;
          break;
        }
      }
    }

    for (const imp of args.imports ?? []) {
      const decl = sf.getImportDeclaration(
        (d: ImportDeclaration) => d.getModuleSpecifierValue() === imp.from,
      );
      decl?.remove();
    }

    ctx.releaseRegion(rel, regionKeyFor(args));
    return { touchedFiles: changed ? [rel] : [] };
  },
};

function resolveFilePath(
  ctx: { projectRoot: string; appRoot: string },
  args: AddJsxChildArgs,
): string {
  const base = args.base ?? "app";
  if (base.startsWith("package:")) {
    return path.join(ctx.projectRoot, "packages", base.slice("package:".length), args.file);
  }
  return path.join(base === "repo" ? ctx.projectRoot : ctx.appRoot, args.file);
}

function regionKeyFor(args: AddJsxChildArgs): string {
  if (args.regionKey) return args.regionKey;
  const leading = args.element.match(/<\s*([A-Za-z_$][\w$]*)/)?.[1] ?? "child";
  return `jsx.${args.parent}.${leading}`;
}

function addImports(sf: SourceFile, imports: AddJsxChildArgs["imports"]): void {
  if (!imports) return;
  for (const imp of imports) {
    if (imp.default) addDefaultImport(sf, imp.from, imp.default);
    if (imp.named && imp.named.length > 0) addNamedImport(sf, imp.from, imp.named);
  }
}

/** Find the first opening JSX element whose tag name matches. */
function findFirstJsxElement(sf: SourceFile, tag: string): JsxElement | undefined {
  for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    if (el.getOpeningElement().getTagNameNode().getText() === tag) return el;
  }
  return undefined;
}

/**
 * Text-edit insertion keeping the parent's existing child indent. Mirrors
 * the approach in `add-plugin-to-call` so we don't reformat 2-space JSX to
 * ts-morph's 4-space default.
 */
function insertChild(
  sf: SourceFile,
  parent: JsxElement,
  element: string,
  position: "start" | "end",
): void {
  const opening = parent.getOpeningElement();
  const closing = parent.getClosingElement();
  const children = parent.getJsxChildren();

  // No existing JSX children (or only whitespace text) → insert between tags
  // with a single newline + matching indent based on opening element's column.
  const fullText = sf.getFullText();
  const meaningfulChildren = children.filter((c: Node) => {
    if (c.getKind() === SyntaxKind.JsxText) return c.getText().trim().length > 0;
    return true;
  });

  if (meaningfulChildren.length === 0) {
    const openIndent = leadingIndent(fullText, opening.getStart());
    const childIndent = openIndent + "  ";
    sf.insertText(opening.getEnd(), `\n${childIndent}${element}\n${openIndent}`);
    // Re-find: the old `closing` handle's position is stale but we just need
    // the file written. Caller saves the project.
    return;
  }

  if (position === "start") {
    const first = meaningfulChildren[0]!;
    const indent = leadingIndent(fullText, first.getStart());
    sf.insertText(first.getStart(), `${element}\n${indent}`);
  } else {
    const last = meaningfulChildren[meaningfulChildren.length - 1]!;
    const indent = leadingIndent(fullText, last.getStart());
    sf.insertText(last.getEnd(), `\n${indent}${element}`);
  }
  // Use `closing` to silence unused-var lint while keeping its reference for
  // potential future positioning logic.
  void closing;
}

function leadingIndent(text: string, offset: number): string {
  // Walk back from `offset` to the previous newline, returning the whitespace.
  let i = offset - 1;
  while (i >= 0 && text[i] !== "\n") i -= 1;
  let start = i + 1;
  while (start < offset && (text[start] === " " || text[start] === "\t")) start += 1;
  return text.slice(i + 1, start);
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "");
}

export default addJsxChild;
