import path from "node:path";

import { assertSafeRelativePath } from "@stanza/registry";

import { type Codemod, type ImportDeclaration } from "../index";

/**
 * Swap the module specifier of an existing `import` statement in place.
 *
 * Useful for redirecting a framework-shipped import to one shipped by another
 * module — e.g. switching `import "./globals.css"` to
 * `import "@my-app/ui/globals.css"` so a UI module's stylesheet supplants the
 * framework's default. Preserves the import kind (side-effect, default, named)
 * and any binding names; only the module specifier changes.
 *
 * Idempotent: a no-op when the file already imports from `to` (matching
 * neither `from` nor a stale prior swap matters — we just check the
 * destination).
 */
export type ReplaceImportArgs = {
  /** Path to the file, relative to `base`. */
  file: string;
  /**
   * Where `file` resolves against:
   *  - `"repo"`: `ctx.projectRoot`
   *  - `"app"` (default): `ctx.appRoot`
   *  - `"package:<dir>"`: `<projectRoot>/packages/<dir>/`
   */
  base?: "app" | "repo" | `package:${string}`;
  /** Existing module specifier to find. Matched exactly (no normalization). */
  from: string;
  /** New module specifier to write. */
  to: string;
  /**
   * Region key segment used to track ownership. Defaults to `imports.<to>`.
   */
  regionKey?: string;
};

const replaceImport: Codemod<ReplaceImportArgs> = {
  id: "replace-import",
  description: "Swap the module specifier of an existing `import` statement in place.",

  apply(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    const sf = ctx.project().addSourceFileAtPath(abs);

    // Already pointing at `to`? Treat as idempotent no-op.
    const alreadyAtTarget = sf
      .getImportDeclarations()
      .some((d: ImportDeclaration) => d.getModuleSpecifierValue() === args.to);
    if (alreadyAtTarget) {
      // Still claim so remove() knows to release.
      ctx.claimRegion(rel, regionKeyFor(args));
      return { touchedFiles: [] };
    }

    const decl = sf.getImportDeclaration(
      (d: ImportDeclaration) => d.getModuleSpecifierValue() === args.from,
    );
    if (!decl) {
      throw new Error(
        `replace-import: no import from "${args.from}" in ${rel}. ` +
          `Already swapped, or the file's imports diverged from the expected shape.`,
      );
    }

    decl.setModuleSpecifier(args.to);
    ctx.claimRegion(rel, regionKeyFor(args));

    return { touchedFiles: [rel] };
  },

  revert(ctx, args) {
    const abs = resolveFilePath(ctx, args);
    const rel = path.relative(ctx.projectRoot, abs);
    const sf = ctx.project().addSourceFileAtPath(abs);

    const decl = sf.getImportDeclaration(
      (d: ImportDeclaration) => d.getModuleSpecifierValue() === args.to,
    );
    if (decl) decl.setModuleSpecifier(args.from);

    ctx.releaseRegion(rel, regionKeyFor(args));
    return { touchedFiles: decl ? [rel] : [] };
  },
};

function resolveFilePath(
  ctx: { projectRoot: string; appRoot: string },
  args: ReplaceImportArgs,
): string {
  assertSafeRelativePath(args.file, "replace-import: args.file");
  const base = args.base ?? "app";
  if (base.startsWith("package:")) {
    const dir = base.slice("package:".length);
    assertSafeRelativePath(dir, "replace-import: args.base package dir");
    return path.join(ctx.projectRoot, "packages", dir, args.file);
  }
  return path.join(base === "repo" ? ctx.projectRoot : ctx.appRoot, args.file);
}

function regionKeyFor(args: ReplaceImportArgs): string {
  return args.regionKey ?? `imports.${args.to}`;
}

export default replaceImport;
