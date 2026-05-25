import path from "node:path";

import type { ArrayLiteralExpression } from "ts-morph";

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

/**
 * Insert a plugin call into the `<property>: [...]` array of the FIRST
 * argument of a CallExpression whose callee matches `args.callee`. The array
 * property is auto-created with `[]` when missing. Each module specifier in
 * `args.imports` is added (deduped, alias-aware).
 *
 * Covers the "add to a framework config's plugin array" pattern generically —
 * `defineConfig({ plugins: [...] })` (Vite), `betterAuth({ plugins: [...] })`
 * (Better Auth), `createApp({ plugins: [...] })` (Vue), etc. — so module
 * authors don't need to keep adding niche per-framework codemods.
 */
export type AddPluginToCallArgs = {
  /** Path to the file, relative to `base`. */
  file: string;
  /**
   * Where `file` resolves against:
   *  - `"repo"`: `ctx.projectRoot`
   *  - `"app"` (default): `ctx.appRoot`
   *  - `"package:<dir>"`: `<projectRoot>/packages/<dir>/`
   */
  base?: "app" | "repo" | `package:${string}`;
  /** Identifier name of the call expression to find, e.g. `"betterAuth"`. */
  callee: string;
  /** Which argument of the call. Defaults to 0. Must be an object literal. */
  argIndex?: number;
  /** Property name whose initializer is the target array literal. */
  property: string;
  /**
   * Plugin call inserted verbatim into the array, e.g.
   * `"polar({ client: polarClient, use: [checkout()] })"`. The codemod is
   * idempotent on the normalized form of this string.
   */
  call: string;
  /**
   * Imports to add. Each entry resolves to one import declaration (named +
   * default may share a single declaration; the helper merges duplicates).
   */
  imports?: Array<{
    /** Module specifier. */
    from: string;
    /** Named imports — string or `{ name, alias }`. */
    named?: NamedImportSpec[];
    /** Default import binding name. */
    default?: string;
  }>;
  /**
   * Position in the array. Defaults to `"end"`. Anchors (`before:<name>` /
   * `after:<name>`) match elements whose call text starts with `<name>(`.
   * Missing anchor logs a warning and falls back to `"end"`.
   */
  position?: "start" | "end" | `before:${string}` | `after:${string}`;
  /**
   * Region key segment used to track ownership. Defaults to the callee name
   * + plugin call's leading identifier, e.g. `betterAuth.plugins.polar`.
   */
  regionKey?: string;
};

const addPluginToCall: Codemod<AddPluginToCallArgs> = {
  id: "add-plugin-to-call",
  description:
    "Insert a plugin call into a `<property>: [...]` array inside a call expression's object-literal argument.",

  apply(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    const sf = ctx.project().addSourceFileAtPath(abs);
    const plugins = getOrCreatePluginsArray(sf, args);

    // Idempotency: same call already present → no-op.
    const target = normalize(args.call);
    const elements = plugins.getElements();
    if (elements.some((el: Node) => normalize(el.getText()) === target)) {
      return { touchedFiles: [] };
    }

    addImports(sf, args.imports);

    const index = resolveIndex(plugins, args.position ?? "end", args.call);
    insertPluginCall(sf, plugins, index, args.call);

    ctx.claimRegion(rel, regionKeyFor(args));

    return { touchedFiles: [rel] };
  },

  revert(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    const sf = ctx.project().addSourceFileAtPath(abs);
    const plugins = findPluginsArray(sf, args);

    if (plugins) {
      const target = normalize(args.call);
      const matching = plugins.getElements().find((el: Node) => normalize(el.getText()) === target);
      if (matching) plugins.removeElement(matching);
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
  args: AddPluginToCallArgs,
): string {
  const base = args.base ?? "app";
  if (base.startsWith("package:")) {
    return path.join(ctx.projectRoot, "packages", base.slice("package:".length), args.file);
  }
  return path.join(base === "repo" ? ctx.projectRoot : ctx.appRoot, args.file);
}

function addImports(sf: SourceFile, imports: AddPluginToCallArgs["imports"]): void {
  if (!imports) return;
  for (const imp of imports) {
    if (imp.default) addDefaultImport(sf, imp.from, imp.default);
    if (imp.named && imp.named.length > 0) addNamedImport(sf, imp.from, imp.named);
  }
}

function regionKeyFor(args: AddPluginToCallArgs): string {
  if (args.regionKey) return args.regionKey;
  const leading = args.call.match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "plugin";
  return `${args.callee}.${args.property}.${leading}`;
}

/**
 * Find the target plugins array in the file. Returns `null` if any step
 * fails (no matching call, wrong arg shape, missing property). Used by
 * `revert` where missing structure is fine — there's nothing to remove.
 */
function findPluginsArray(sf: SourceFile, args: AddPluginToCallArgs): ArrayLiteral | null {
  const call = findCalleeCall(sf, args.callee);
  if (!call) return null;
  const callArgs = call.getArguments();
  const argNode = callArgs[args.argIndex ?? 0]?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!argNode) return null;
  const prop = argNode.getProperty(args.property)?.asKind(SyntaxKind.PropertyAssignment);
  return prop?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression) ?? null;
}

/**
 * Locate (or create) the target plugins array. Apply path uses this — if the
 * object literal exists but lacks the property, we add `<property>: []` so
 * downstream insert always has somewhere to land. Throws actionably when the
 * surrounding structure isn't what we expect (no matching call, wrong arg
 * shape, property exists with a non-array value).
 */
function getOrCreatePluginsArray(sf: SourceFile, args: AddPluginToCallArgs): ArrayLiteral {
  const call = findCalleeCall(sf, args.callee);
  if (!call) {
    throw new Error(
      `add-plugin-to-call: ${sf.getBaseName()} has no \`${args.callee}(...)\` call. ` +
        `Make sure the file declares one.`,
    );
  }

  const argIndex = args.argIndex ?? 0;
  const argNode = call.getArguments()[argIndex]?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!argNode) {
    throw new Error(
      `add-plugin-to-call: ${sf.getBaseName()}'s \`${args.callee}\` call needs an ` +
        `object-literal at argument ${argIndex}.`,
    );
  }

  const prop = argNode.getProperty(args.property);
  if (!prop) {
    // Create `<property>: []` matching the surrounding indent. ts-morph's
    // `addPropertyAssignment` uses its default 4-space indent which doesn't
    // match 2-space configs — same indent-preservation logic the array-
    // element insertion uses below.
    const properties = argNode.getProperties();
    if (properties.length > 0) {
      const last = properties[properties.length - 1]!;
      const trivia = sf.getFullText().slice(last.getFullStart(), last.getStart());
      const indent = trivia.match(/\n([ \t]*)$/)?.[1] ?? "  ";
      sf.insertText(last.getEnd(), `,\n${indent}${args.property}: []`);
    } else {
      // Empty object literal — fall back to ts-morph's default formatting.
      argNode.addPropertyAssignment({ name: args.property, initializer: "[]" });
    }
    // `sf.insertText` and `addPropertyAssignment` both invalidate the captured
    // `argNode` reference — re-traverse from the source file to find the new
    // property's array literal.
    const refreshedArgs = findCalleeCall(sf, args.callee)?.getArguments();
    const refreshed = refreshedArgs?.[args.argIndex ?? 0]?.asKind(
      SyntaxKind.ObjectLiteralExpression,
    );
    const created = refreshed
      ?.getProperty(args.property)
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
    if (!created) {
      throw new Error(
        `add-plugin-to-call: failed to create \`${args.property}: []\` in ${sf.getBaseName()}.`,
      );
    }
    return created;
  }

  const arr = prop
    .asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (!arr) {
    throw new Error(
      `add-plugin-to-call: ${sf.getBaseName()}'s \`${args.property}\` needs an array literal — ` +
        `convert any spread or function shape into a plain array first.`,
    );
  }
  return arr;
}

function findCalleeCall(sf: SourceFile, callee: string) {
  return sf
    .getFirstDescendant((node) => {
      if (node.getKind() !== SyntaxKind.CallExpression) return false;
      const call = node.asKind(SyntaxKind.CallExpression);
      return call?.getExpression().getText() === callee;
    })
    ?.asKind(SyntaxKind.CallExpression);
}

/**
 * Splice a new call expression into the array while preserving the indent
 * style of existing elements. ts-morph's `insertElement` reformats with
 * `manipulationSettings.indentationText` (default 4 spaces), which breaks
 * 2-space configs — we do the text edit ourselves and copy the existing
 * leading whitespace.
 */
function insertPluginCall(
  sf: SourceFile,
  plugins: ArrayLiteral,
  index: number,
  call: string,
): void {
  const elements = plugins.getElements();
  if (elements.length === 0) {
    plugins.insertElement(index, call);
    return;
  }

  const probe = elements[Math.min(index, elements.length - 1)];
  if (!probe) {
    plugins.insertElement(index, call);
    return;
  }

  const trivia = sf.getFullText().slice(probe.getFullStart(), probe.getStart());
  const newlineIndent = trivia.match(/\n([ \t]*)$/);

  if (newlineIndent) {
    const indent = newlineIndent[1];
    if (index < elements.length) {
      sf.insertText(probe.getStart(), `${call},\n${indent}`);
    } else {
      const last = elements[elements.length - 1]!;
      sf.insertText(last.getEnd(), `,\n${indent}${call}`);
    }
  } else {
    if (index < elements.length) {
      sf.insertText(probe.getStart(), `${call}, `);
    } else {
      const last = elements[elements.length - 1]!;
      sf.insertText(last.getEnd(), `, ${call}`);
    }
  }
}

function resolveIndex(
  plugins: ArrayLiteral,
  position: NonNullable<AddPluginToCallArgs["position"]>,
  call: string,
): number {
  const elements = plugins.getElements();
  if (position === "start") return 0;
  if (position === "end") return elements.length;

  const sep = position.indexOf(":");
  const direction = position.slice(0, sep);
  const anchor = position.slice(sep + 1);
  const anchorIdx = elements.findIndex((el: Node) =>
    normalize(el.getText()).startsWith(`${anchor}(`),
  );
  if (anchorIdx === -1) {
    const leading = call.match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "plugin";
    console.warn(
      `add-plugin-to-call: anchor "${anchor}" not found — appending ${leading}() at end.`,
    );
    return elements.length;
  }
  return direction === "before" ? anchorIdx : anchorIdx + 1;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "");
}

export default addPluginToCall;
