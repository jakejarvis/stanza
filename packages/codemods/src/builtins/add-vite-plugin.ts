import path from "node:path";

import {
  addDefaultImport,
  addNamedImport,
  type Codemod,
  type ExportAssignment,
  type ImportDeclaration,
  type Node,
  type SourceFile,
  SyntaxKind,
} from "../index";

/**
 * Splice a plugin into an existing `vite.config.ts`'s `defineConfig({ plugins: [...] })`
 * array. Lets multiple modules layer plugins on top of the framework's base
 * config without clobbering. Supports anchor positions (`before:<name>` /
 * `after:<name>`) — essential for frameworks with strict plugin order, like
 * TanStack Start (which requires `tanstackStart()` before `react()`).
 */
export type AddVitePluginArgs = {
  /**
   * Plugin call expression inserted verbatim into the array,
   * e.g. `"tailwindcss()"` or `"react({ jsxRuntime: 'classic' })"`.
   * The leading identifier should match `importName`.
   */
  call: string;
  /** Module specifier for the import, e.g. `"@tailwindcss/vite"`. */
  importFrom: string;
  /** Local identifier the call references. */
  importName: string;
  /** Defaults to `"default"`. */
  importKind?: "named" | "default";
  /**
   * Position in the plugins array. Defaults to `"end"`.
   *  - `"start"` / `"end"`: bookends.
   *  - `before:<name>` / `after:<name>`: anchor relative to an existing
   *    element whose call expression starts with `<name>(`. If the anchor
   *    can't be found, the codemod logs and falls back to `"end"` so a
   *    missing optional anchor doesn't fail the install.
   */
  position?: "start" | "end" | `before:${string}` | `after:${string}`;
};

const VITE_CONFIG_FILE = "vite.config.ts";

const addVitePlugin: Codemod<AddVitePluginArgs> = {
  id: "add-vite-plugin",
  description: "Insert a plugin into vite.config.ts's defineConfig plugins array.",

  apply(ctx, args) {
    const abs = path.join(ctx.appRoot, VITE_CONFIG_FILE);
    const rel = path.relative(ctx.projectRoot, abs);
    const sf = ctx.project().addSourceFileAtPath(abs);
    const plugins = findPluginsArray(sf);

    // Idempotency: same plugin call already present → no-op.
    const target = normalize(args.call);
    const elements = plugins.getElements();
    if (elements.some((el: Node) => normalize(el.getText()) === target)) {
      return { touchedFiles: [] };
    }

    if (args.importKind === "named") {
      addNamedImport(sf, args.importFrom, args.importName);
    } else {
      addDefaultImport(sf, args.importFrom, args.importName);
    }

    const index = resolveIndex(plugins, args.position ?? "end", args.importName);
    plugins.insertElement(index, args.call);

    ctx.claimRegion(rel, `vite.plugins.${args.importName}`);

    return { touchedFiles: [rel] };
  },

  revert(ctx, args) {
    const abs = path.join(ctx.appRoot, VITE_CONFIG_FILE);
    const rel = path.relative(ctx.projectRoot, abs);
    const sf = ctx.project().addSourceFileAtPath(abs);
    const plugins = findPluginsArray(sf);

    const target = normalize(args.call);
    const matching = plugins.getElements().find((el: Node) => normalize(el.getText()) === target);
    if (matching) plugins.removeElement(matching);

    const importDecl = sf.getImportDeclaration(
      (d: ImportDeclaration) => d.getModuleSpecifierValue() === args.importFrom,
    );
    importDecl?.remove();

    ctx.releaseRegion(rel, `vite.plugins.${args.importName}`);

    return { touchedFiles: [rel] };
  },
};

/**
 * Locate the `plugins` ArrayLiteralExpression inside the default-exported
 * `defineConfig({...})` call. Throws with an actionable hint if the shape
 * isn't what we expect — better to fail loudly than silently no-op.
 */
function findPluginsArray(sf: SourceFile) {
  const defaultExport = sf.getExportAssignment((a: ExportAssignment) => !a.isExportEquals());
  if (!defaultExport) {
    throw new Error(
      `add-vite-plugin: ${sf.getBaseName()} has no default export. Expected \`export default defineConfig({ plugins: [...] })\`.`,
    );
  }

  const expr = defaultExport.getExpression();
  const call = expr.asKind(SyntaxKind.CallExpression);
  if (!call) {
    throw new Error(
      `add-vite-plugin: ${sf.getBaseName()}'s default export isn't a call expression. ` +
        `Expected \`export default defineConfig({ plugins: [...] })\`.`,
    );
  }

  const arg = call.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!arg) {
    throw new Error(
      `add-vite-plugin: ${sf.getBaseName()}'s defineConfig call needs an object-literal argument.`,
    );
  }

  const pluginsProp = arg.getProperty("plugins")?.asKind(SyntaxKind.PropertyAssignment);
  const pluginsArr = pluginsProp?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (!pluginsArr) {
    throw new Error(
      `add-vite-plugin: ${sf.getBaseName()} needs a \`plugins: [...]\` array literal in its defineConfig argument. ` +
        `Convert any spread or function shape into a plain array first.`,
    );
  }

  return pluginsArr;
}

function resolveIndex(
  plugins: ReturnType<typeof findPluginsArray>,
  position: NonNullable<AddVitePluginArgs["position"]>,
  newImportName: string,
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
    console.warn(
      `add-vite-plugin: anchor "${anchor}" not found in plugins array for ${newImportName} — appending at end.`,
    );
    return elements.length;
  }
  return direction === "before" ? anchorIdx : anchorIdx + 1;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "");
}

export default addVitePlugin;
