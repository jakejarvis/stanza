import path from "node:path";

import {
  type Codemod,
  type JsxAttribute,
  type JsxOpeningElement,
  type SourceFile,
  SyntaxKind,
} from "../index";

/**
 * Set attributes on the file's root `<html>` JSX element. Used by UI modules
 * to add `suppressHydrationWarning` and apply theme/font classes during
 * setup — the canonical example is shadcn's `<html lang="en"
 * suppressHydrationWarning className="antialiased font-sans">`.
 *
 * Three attribute shapes are supported:
 *  - **`boolean: true`** — emit a bare attribute (`suppressHydrationWarning`)
 *  - **`value: string`** — emit a string literal (`lang="en"`). For
 *    `name: "className"` the value is *merged* into any existing className —
 *    duplicates are skipped (token-wise), order is preserved.
 *  - **`expression: string`** — emit a JSX expression container with the raw
 *    code inside (`className={cn("a", "b")}`). For `className` this *replaces*
 *    any existing className (no automatic merge possible at the AST level).
 *
 * Idempotent: a no-op when every requested attribute is already satisfied.
 */
export type SetHtmlAttributesArgs = {
  /** Path to the file, relative to `base`. */
  file: string;
  /**
   * Where `file` resolves against:
   *  - `"repo"`: `ctx.projectRoot`
   *  - `"app"` (default): `ctx.appRoot`
   *  - `"package:<dir>"`: `<projectRoot>/packages/<dir>/`
   */
  base?: "app" | "repo" | `package:${string}`;
  /** Attributes to set/merge. Each entry uses exactly one of `boolean | value | expression`. */
  attributes: Array<
    | { name: string; boolean: true }
    | { name: string; value: string }
    | { name: string; expression: string }
  >;
  /**
   * Region key segment used to track ownership. Defaults to
   * `html.attributes.<comma-joined-names>`.
   */
  regionKey?: string;
};

const setHtmlAttributes: Codemod<SetHtmlAttributesArgs> = {
  id: "set-html-attributes",
  description: "Set or merge attributes on the file's root `<html>` JSX element.",

  apply(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    const sf = ctx.project().addSourceFileAtPath(abs);

    const opening = findHtmlOpening(sf);
    if (!opening) {
      throw new Error(
        `set-html-attributes: ${rel} has no top-level \`<html …>\` element. ` +
          `This codemod targets the root layout file.`,
      );
    }

    let changed = false;
    for (const attr of args.attributes) {
      if (applyOne(opening, attr)) changed = true;
    }

    ctx.claimRegion(rel, regionKeyFor(args));
    return { touchedFiles: changed ? [rel] : [] };
  },

  revert(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    const sf = ctx.project().addSourceFileAtPath(abs);
    const opening = findHtmlOpening(sf);

    let changed = false;
    if (opening) {
      for (const attr of args.attributes) {
        if (revertOne(opening, attr)) changed = true;
      }
    }
    ctx.releaseRegion(rel, regionKeyFor(args));
    return { touchedFiles: changed ? [rel] : [] };
  },
};

function resolveFilePath(
  ctx: { projectRoot: string; appRoot: string },
  args: SetHtmlAttributesArgs,
): string {
  const base = args.base ?? "app";
  if (base.startsWith("package:")) {
    return path.join(ctx.projectRoot, "packages", base.slice("package:".length), args.file);
  }
  return path.join(base === "repo" ? ctx.projectRoot : ctx.appRoot, args.file);
}

function regionKeyFor(args: SetHtmlAttributesArgs): string {
  if (args.regionKey) return args.regionKey;
  return `html.attributes.${args.attributes.map((a) => a.name).join(",")}`;
}

/** Find the first `<html …>` opening element in the file. */
function findHtmlOpening(sf: SourceFile): JsxOpeningElement | undefined {
  for (const node of sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    if (node.getTagNameNode().getText() === "html") return node;
  }
  return undefined;
}

function getAttribute(opening: JsxOpeningElement, name: string): JsxAttribute | undefined {
  for (const a of opening.getAttributes()) {
    const attr = a.asKind(SyntaxKind.JsxAttribute);
    if (attr && attr.getNameNode().getText() === name) return attr;
  }
  return undefined;
}

/** Returns `true` when the element text was modified. */
function applyOne(
  opening: JsxOpeningElement,
  attr: SetHtmlAttributesArgs["attributes"][number],
): boolean {
  const existing = getAttribute(opening, attr.name);

  if ("boolean" in attr) {
    if (existing) return false; // present in any form → no change
    opening.addAttribute({ name: attr.name });
    return true;
  }

  if ("value" in attr) {
    if (attr.name === "className" && existing) {
      // Merge tokens into the existing string literal (only — bail on expr form).
      const init = existing.getInitializer();
      if (!init || init.getKind() !== SyntaxKind.StringLiteral) return false;
      const current: string[] = init.getText().slice(1, -1).split(/\s+/).filter(Boolean);
      const incoming: string[] = attr.value.split(/\s+/).filter(Boolean);
      const additions = incoming.filter((t: string) => !current.includes(t));
      if (additions.length === 0) return false;
      init.replaceWithText(JSON.stringify([...current, ...additions].join(" ")));
      return true;
    }
    if (existing) {
      const init = existing.getInitializer();
      if (init && init.getText() === JSON.stringify(attr.value)) return false;
      existing.setInitializer(JSON.stringify(attr.value));
      return true;
    }
    opening.addAttribute({ name: attr.name, initializer: JSON.stringify(attr.value) });
    return true;
  }

  // `expression`
  const expr = `{${attr.expression}}`;
  if (existing) {
    const init = existing.getInitializer();
    if (init && init.getText() === expr) return false;
    existing.setInitializer(expr);
    return true;
  }
  opening.addAttribute({ name: attr.name, initializer: expr });
  return true;
}

function revertOne(
  opening: JsxOpeningElement,
  attr: SetHtmlAttributesArgs["attributes"][number],
): boolean {
  const existing = getAttribute(opening, attr.name);
  if (!existing) return false;

  // For className value-merge we can only safely remove tokens we know about.
  if ("value" in attr && attr.name === "className") {
    const init = existing.getInitializer();
    if (init && init.getKind() === SyntaxKind.StringLiteral) {
      const current: string[] = init.getText().slice(1, -1).split(/\s+/).filter(Boolean);
      const toRemove = new Set<string>(attr.value.split(/\s+/).filter(Boolean));
      const remaining = current.filter((t: string) => !toRemove.has(t));
      if (remaining.length === 0) {
        existing.remove();
      } else if (remaining.length !== current.length) {
        init.replaceWithText(JSON.stringify(remaining.join(" ")));
      }
      return true;
    }
  }

  existing.remove();
  return true;
}

export default setHtmlAttributes;
