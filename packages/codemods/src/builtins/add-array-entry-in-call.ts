import path from "node:path";

import type { ArrayLiteralExpression, CallExpression, ObjectLiteralExpression } from "ts-morph";

import {
  addDefaultImport,
  addNamedImport,
  type Codemod,
  type ImportDeclaration,
  type NamedImportSpec,
  type Node,
  type SourceFile,
  SyntaxKind,
} from "../index";

type ArrayLiteral = ArrayLiteralExpression;
type ObjectLiteral = ObjectLiteralExpression;

/**
 * Splice an entry into an array literal that lives at a *nested* property
 * path inside a CallExpression's object argument. The more powerful sibling
 * of `add-plugin-to-call` — `add-plugin-to-call` covers the flat case
 * (`callee({ <property>: [...] })`); this codemod walks a dotted `property`
 * path and supports descent through arrow-function-returning-object
 * properties via the `name()` segment syntax.
 *
 * The motivating use case is TanStack Start's root route:
 *
 *   ```ts
 *   createRootRoute({
 *     head: () => ({
 *       links: [{ rel: "stylesheet", href: appCss }],
 *     }),
 *   })
 *   ```
 *
 * which we reach with `callee: "createRootRoute"` + `property: "head().links"`.
 * Plain dotted paths (e.g. `"foo.bar"`) walk regular property assignments;
 * append `()` to a segment to dive into an arrow function's returned object.
 *
 * Creates missing intermediate properties (and the terminal array) when
 * possible; idempotent on the normalized form of `entry`.
 */
export type AddArrayEntryInCallArgs = {
  /** Path to the file, relative to `base`. */
  file: string;
  /**
   * Where `file` resolves against:
   *  - `"repo"`: `ctx.projectRoot`
   *  - `"app"` (default): `ctx.appRoot`
   *  - `"package:<dir>"`: `<projectRoot>/packages/<dir>/`
   */
  base?: "app" | "repo" | `package:${string}`;
  /** Identifier of the call expression to find, e.g. `"createRootRoute"`. */
  callee: string;
  /** Which argument of the call. Defaults to 0. Must be an object literal. */
  argIndex?: number;
  /**
   * Dotted path from the call argument to the target array. Each segment
   * navigates one property; suffix a segment with `()` to dive into an arrow
   * function's returned object expression.
   *
   *   "links"              → arg.links
   *   "head.links"         → arg.head.links
   *   "head().links"       → (arg.head as () => Obj)().links
   */
  property: string;
  /** Source text of the entry to insert into the array, verbatim. */
  entry: string;
  /**
   * Imports to add. Same shape as `add-plugin-to-call`'s — each entry
   * resolves to one import declaration (named + default merge).
   */
  imports?: Array<{
    from: string;
    named?: NamedImportSpec[];
    default?: string;
  }>;
  /**
   * Position in the array. Defaults to `"end"`. Anchors (`before:<text>` /
   * `after:<text>`) match elements whose text starts with `<text>`.
   * Missing anchor logs a warning and falls back to `"end"`.
   */
  position?: "start" | "end" | `before:${string}` | `after:${string}`;
  /**
   * Region key segment used to track ownership. Defaults to
   * `<callee>.<property>.<entry-prefix>`.
   */
  regionKey?: string;
};

const addArrayEntryInCall: Codemod<AddArrayEntryInCallArgs> = {
  id: "add-array-entry-in-call",
  description: "Insert an entry into an array nested inside a call expression's object argument.",

  apply(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    const sf = ctx.project().addSourceFileAtPath(abs);
    const arr = getOrCreateArray(sf, args);

    const target = normalize(args.entry);
    const elements = arr.getElements();
    if (elements.some((el: Node) => normalize(el.getText()) === target)) {
      // Already present — claim so revert works but report no touch.
      ctx.claimRegion(rel, regionKeyFor(args));
      return { touchedFiles: [] };
    }

    addImports(sf, args.imports);
    const index = resolveIndex(arr, args.position ?? "end", args.entry);
    insertEntry(sf, arr, index, args.entry);
    ctx.claimRegion(rel, regionKeyFor(args));
    return { touchedFiles: [rel] };
  },

  revert(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    const sf = ctx.project().addSourceFileAtPath(abs);
    const arr = findArray(sf, args);

    if (arr) {
      const target = normalize(args.entry);
      const matching = arr.getElements().find((el: Node) => normalize(el.getText()) === target);
      if (matching) arr.removeElement(matching);
    }

    for (const imp of args.imports ?? []) {
      const decl = sf.getImportDeclaration(
        (d: ImportDeclaration) => d.getModuleSpecifierValue() === imp.from,
      );
      decl?.remove();
    }

    ctx.releaseRegion(rel, regionKeyFor(args));
    return { touchedFiles: [rel] };
  },
};

function resolveFilePath(
  ctx: { projectRoot: string; appRoot: string },
  args: AddArrayEntryInCallArgs,
): string {
  const base = args.base ?? "app";
  if (base.startsWith("package:")) {
    return path.join(ctx.projectRoot, "packages", base.slice("package:".length), args.file);
  }
  return path.join(base === "repo" ? ctx.projectRoot : ctx.appRoot, args.file);
}

function regionKeyFor(args: AddArrayEntryInCallArgs): string {
  if (args.regionKey) return args.regionKey;
  const leading = args.entry.match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "entry";
  return `${args.callee}.${args.property}.${leading}`;
}

function addImports(sf: SourceFile, imports: AddArrayEntryInCallArgs["imports"]): void {
  if (!imports) return;
  for (const imp of imports) {
    if (imp.default) addDefaultImport(sf, imp.from, imp.default);
    if (imp.named && imp.named.length > 0) addNamedImport(sf, imp.from, imp.named);
  }
}

function findCalleeCall(sf: SourceFile, callee: string): CallExpression | undefined {
  return sf
    .getFirstDescendant((node) => {
      if (node.getKind() !== SyntaxKind.CallExpression) return false;
      const call = node.asKind(SyntaxKind.CallExpression);
      return call?.getExpression().getText() === callee;
    })
    ?.asKind(SyntaxKind.CallExpression);
}

/** Parse `"head().links"` → `[{ name: "head", call: true }, { name: "links" }]`. */
type PathSegment = { name: string; call: boolean };

function parsePath(property: string): PathSegment[] {
  return property.split(".").map((raw) => {
    if (raw.endsWith("()")) return { name: raw.slice(0, -2), call: true };
    return { name: raw, call: false };
  });
}

/** Returns `null` if any segment isn't present — fine for `revert`. */
function findArray(sf: SourceFile, args: AddArrayEntryInCallArgs): ArrayLiteral | null {
  const call = findCalleeCall(sf, args.callee);
  if (!call) return null;
  const arg = call.getArguments()[args.argIndex ?? 0]?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!arg) return null;

  const segments = parsePath(args.property);
  let obj: ObjectLiteral | null = arg;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i]!;
    obj = descend(obj, seg);
    if (!obj) return null;
  }
  const last = segments[segments.length - 1]!;
  const prop = obj?.getProperty(last.name)?.asKind(SyntaxKind.PropertyAssignment);
  return prop?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression) ?? null;
}

/** Same as `findArray` but creates missing intermediates and the terminal array. */
function getOrCreateArray(sf: SourceFile, args: AddArrayEntryInCallArgs): ArrayLiteral {
  const call = findCalleeCall(sf, args.callee);
  if (!call) {
    throw new Error(
      `add-array-entry-in-call: ${sf.getBaseName()} has no \`${args.callee}(...)\` call.`,
    );
  }
  const argIndex = args.argIndex ?? 0;
  const arg = call.getArguments()[argIndex]?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!arg) {
    throw new Error(
      `add-array-entry-in-call: ${sf.getBaseName()}'s \`${args.callee}\` call needs an ` +
        `object-literal at argument ${argIndex}.`,
    );
  }

  const segments = parsePath(args.property);
  // Walk/create intermediates.
  let obj: ObjectLiteral = arg;
  for (let i = 0; i < segments.length - 1; i += 1) {
    obj = ensureIntermediate(sf, obj, segments[i]!);
  }
  // Terminal segment must resolve (or be created) as an array.
  return ensureTerminalArray(sf, obj, segments[segments.length - 1]!);
}

/** Descend a single segment; returns `null` if the property doesn't match. */
function descend(obj: ObjectLiteral, seg: PathSegment): ObjectLiteral | null {
  const prop = obj.getProperty(seg.name)?.asKind(SyntaxKind.PropertyAssignment);
  if (!prop) return null;
  const init = prop.getInitializer();
  if (!init) return null;
  if (!seg.call) {
    return init.asKind(SyntaxKind.ObjectLiteralExpression) ?? null;
  }
  // Arrow function returning an object: `() => ({...})` (ParenthesizedExpression)
  // or `() => { return {...}; }` (Block + ReturnStatement).
  const arrow = init.asKind(SyntaxKind.ArrowFunction);
  if (!arrow) return null;
  const body = arrow.getBody();
  const parenthesized = body.asKind(SyntaxKind.ParenthesizedExpression);
  if (parenthesized) {
    return parenthesized.getExpression().asKind(SyntaxKind.ObjectLiteralExpression) ?? null;
  }
  const block = body.asKind(SyntaxKind.Block);
  if (block) {
    const ret = block
      .getStatements()
      .find((s) => s.getKind() === SyntaxKind.ReturnStatement)
      ?.asKind(SyntaxKind.ReturnStatement);
    return ret?.getExpression()?.asKind(SyntaxKind.ObjectLiteralExpression) ?? null;
  }
  return body.asKind(SyntaxKind.ObjectLiteralExpression) ?? null;
}

/** Ensure `obj.<seg>` (or `obj.<seg>()`) is an object literal we can descend into. */
function ensureIntermediate(sf: SourceFile, obj: ObjectLiteral, seg: PathSegment): ObjectLiteral {
  const existing = descend(obj, seg);
  if (existing) return existing;

  // Create the property in the form the segment demands.
  const init = seg.call ? "() => ({})" : "{}";
  addObjectProperty(sf, obj, seg.name, init);
  // Re-traverse — the inserted text invalidates the previous handle.
  return findOrThrowAfterInsert(sf, seg);
}

/** Ensure the terminal segment resolves to an array literal; create if missing. */
function ensureTerminalArray(sf: SourceFile, obj: ObjectLiteral, seg: PathSegment): ArrayLiteral {
  // Reject `()` on the terminal — arrays don't return from a call.
  if (seg.call) {
    throw new Error(
      `add-array-entry-in-call: terminal path segment "${seg.name}()" can't be a call — ` +
        `drop the parentheses (the leaf must be an array property).`,
    );
  }
  const prop = obj.getProperty(seg.name)?.asKind(SyntaxKind.PropertyAssignment);
  if (prop) {
    const arr = prop.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
    if (!arr) {
      throw new Error(
        `add-array-entry-in-call: \`${seg.name}\` already exists but isn't an array literal — ` +
          `reshape it manually first.`,
      );
    }
    return arr;
  }
  addObjectProperty(sf, obj, seg.name, "[]");
  // Re-find — the cached `obj` handle is now stale.
  const refreshed = sf
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .findLast((p) => p.getName() === seg.name);
  const arr = refreshed?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (!arr) {
    throw new Error(`add-array-entry-in-call: failed to create \`${seg.name}: []\`.`);
  }
  return arr;
}

/** Insert `<name>: <init>` keeping the surrounding indent. */
function addObjectProperty(sf: SourceFile, obj: ObjectLiteral, name: string, init: string): void {
  const properties = obj.getProperties();
  if (properties.length > 0) {
    const last = properties[properties.length - 1]!;
    const trivia = sf.getFullText().slice(last.getFullStart(), last.getStart());
    const indent = trivia.match(/\n([ \t]*)$/)?.[1] ?? "  ";
    sf.insertText(last.getEnd(), `,\n${indent}${name}: ${init}`);
  } else {
    obj.addPropertyAssignment({ name, initializer: init });
  }
}

/** After a text insert, re-find the segment's object/arrow value or throw. */
function findOrThrowAfterInsert(sf: SourceFile, seg: PathSegment): ObjectLiteral {
  const prop = sf
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .findLast((p) => p.getName() === seg.name);
  if (!prop) {
    throw new Error(`add-array-entry-in-call: failed to materialize property \`${seg.name}\`.`);
  }
  const init = prop.getInitializer();
  if (!init) {
    throw new Error(`add-array-entry-in-call: \`${seg.name}\` has no initializer after insert.`);
  }
  if (!seg.call) {
    const obj = init.asKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) {
      throw new Error(
        `add-array-entry-in-call: \`${seg.name}\` initializer isn't an object after insert.`,
      );
    }
    return obj;
  }
  const arrow = init.asKind(SyntaxKind.ArrowFunction);
  const body = arrow?.getBody();
  const paren = body?.asKind(SyntaxKind.ParenthesizedExpression);
  const obj = paren?.getExpression().asKind(SyntaxKind.ObjectLiteralExpression);
  if (!obj) {
    throw new Error(
      `add-array-entry-in-call: \`${seg.name}\` arrow-returned object missing after insert.`,
    );
  }
  return obj;
}

/** Text-edit insertion so we keep the array's existing indent (ts-morph
 *  `insertElement` would reformat to 4-space). Mirrors add-plugin-to-call. */
function insertEntry(sf: SourceFile, arr: ArrayLiteral, index: number, entry: string): void {
  const elements = arr.getElements();
  if (elements.length === 0) {
    arr.insertElement(index, entry);
    return;
  }

  const probe = elements[Math.min(index, elements.length - 1)];
  if (!probe) {
    arr.insertElement(index, entry);
    return;
  }

  const trivia = sf.getFullText().slice(probe.getFullStart(), probe.getStart());
  const newlineIndent = trivia.match(/\n([ \t]*)$/);

  if (newlineIndent) {
    const indent = newlineIndent[1];
    if (index < elements.length) {
      sf.insertText(probe.getStart(), `${entry},\n${indent}`);
    } else {
      const last = elements[elements.length - 1]!;
      sf.insertText(last.getEnd(), `,\n${indent}${entry}`);
    }
  } else {
    if (index < elements.length) {
      sf.insertText(probe.getStart(), `${entry}, `);
    } else {
      const last = elements[elements.length - 1]!;
      sf.insertText(last.getEnd(), `, ${entry}`);
    }
  }
}

function resolveIndex(
  arr: ArrayLiteral,
  position: NonNullable<AddArrayEntryInCallArgs["position"]>,
  entry: string,
): number {
  const elements = arr.getElements();
  if (position === "start") return 0;
  if (position === "end") return elements.length;

  const sep = position.indexOf(":");
  const direction = position.slice(0, sep);
  const anchor = position.slice(sep + 1);
  const anchorIdx = elements.findIndex((el: Node) =>
    normalize(el.getText()).startsWith(normalize(anchor)),
  );
  if (anchorIdx === -1) {
    const leading = entry.match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "entry";
    console.warn(
      `add-array-entry-in-call: anchor "${anchor}" not found — appending ${leading} at end.`,
    );
    return elements.length;
  }
  return direction === "before" ? anchorIdx : anchorIdx + 1;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "");
}

export default addArrayEntryInCall;
