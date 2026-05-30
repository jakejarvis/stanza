import path from "node:path";

import { assertSafeRelativePath } from "@withstanza/utils";
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
 * Splice a plugin call into a `<property>: [...]` array inside a
 * CallExpression's first object argument — `defineConfig({ plugins: [...] })`,
 * `betterAuth({ plugins: [...] })`, etc. Creates the array property when
 * missing; adds the named/default imports (alias-aware); idempotent.
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

    // Idempotency: same call already present → no-op. Still claim so revert
    // works on installs where the user pre-populated the array manually.
    const target = normalize(args.call);
    const elements = plugins.getElements();
    if (elements.some((el: Node) => normalize(el.getText()) === target)) {
      ctx.claimRegion(rel, regionKeyFor(args));
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
  assertSafeRelativePath(args.file, "add-plugin-to-call: args.file");
  const base = args.base ?? "app";
  if (base.startsWith("package:")) {
    const dir = base.slice("package:".length);
    assertSafeRelativePath(dir, "add-plugin-to-call: args.base package dir");
    return path.join(ctx.projectRoot, "packages", dir, args.file);
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

/** Returns `null` if the structure isn't present — fine for `revert`. */
function findPluginsArray(sf: SourceFile, args: AddPluginToCallArgs): ArrayLiteral | null {
  const call = findCalleeCall(sf, args.callee);
  if (!call) return null;
  const callArgs = call.getArguments();
  const argNode = callArgs[args.argIndex ?? 0]?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!argNode) return null;
  const prop = argNode.getProperty(args.property)?.asKind(SyntaxKind.PropertyAssignment);
  return prop?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression) ?? null;
}

/** Same as `findPluginsArray` but creates `<property>: []` when missing. */
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
    // ts-morph's `addPropertyAssignment` ignores the surrounding indent and
    // injects 4 spaces, breaking 2-space configs — text-edit it ourselves.
    const properties = argNode.getProperties();
    if (properties.length > 0) {
      const last = properties[properties.length - 1]!;
      const trivia = sf.getFullText().slice(last.getFullStart(), last.getStart());
      const indent = trivia.match(/\n([ \t]*)$/)?.[1] ?? "  ";
      sf.insertText(last.getEnd(), `,\n${indent}${args.property}: []`);
    } else {
      argNode.addPropertyAssignment({ name: args.property, initializer: "[]" });
    }
    // `argNode` is stale after the mutation — re-traverse.
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

/** Text-edit insertion so we keep the array's existing indent (ts-morph's
 *  `insertElement` would reformat to 4-space). */
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
