import path from "node:path";

import {
  type Codemod,
  type ExportDeclaration,
  type ExportSpecifier,
  type SourceFile,
} from "../index";

/**
 * Append an `export ... from "X"` statement to a barrel file. The canonical
 * use is wiring auxiliary schema/types into an existing index — e.g. when a
 * module ships `src/db/auth-schema.ts` and needs the Drizzle barrel
 * (`src/db/schema.ts`) to re-export it so introspection sees the new tables.
 *
 * Idempotency, merge semantics, and shape mismatches are explicit:
 *   - Star (`"all"`) over an existing star to the same source → no-op.
 *   - Named over an existing named to the same source → merge missing names.
 *   - Star over named (or named over star) → throws, surfaces a real conflict
 *     so two modules don't silently disagree on how to re-export a peer.
 */
export type ReExportArgs = {
  /** Barrel file path, resolved against `base` (default: the app root). */
  file: string;
  /** Module specifier to re-export from (e.g. `"./auth-schema"`). */
  from: string;
  /**
   * `"all"` (default) emits `export * from "<from>";`. Otherwise a list of
   * named exports emits `export { a, b } from "<from>";`.
   */
  names?: string[] | "all";
  /**
   * Where `file` resolves against:
   *  - `"app"` (default): `ctx.appRoot/<file>` — the active framework app.
   *  - `"package:<dir>"`: `<projectRoot>/packages/<dir>/<file>` — an internal
   *    workspace package. Used when auth needs to wire its schema barrel into
   *    `packages/db/`, which lives outside the app.
   */
  base?: "app" | `package:${string}`;
};

const reExport: Codemod<ReExportArgs> = {
  id: "re-export",
  description: 'Append an `export ... from "X"` statement to a barrel file.',

  apply(ctx, args) {
    const fileAbs = resolveBase(ctx, args);
    const fileRel = path.relative(ctx.projectRoot, fileAbs);
    const sf = openOrThrow(ctx, fileAbs);

    const wantsStar = args.names === undefined || args.names === "all";
    const wantNames = wantsStar ? [] : (args.names as string[]);

    const existing = sf
      .getExportDeclarations()
      .find((d: ExportDeclaration) => d.getModuleSpecifierValue() === args.from);

    if (existing) {
      const isStar = existing.isNamespaceExport();

      if (wantsStar && isStar) return { touchedFiles: [] };

      if (!wantsStar && !isStar) {
        const haveNames = new Set(
          existing.getNamedExports().map((n: ExportSpecifier) => n.getName()),
        );
        const missing = wantNames.filter((n) => !haveNames.has(n));
        if (missing.length === 0) return { touchedFiles: [] };
        existing.addNamedExports(missing.map((name) => ({ name })));
        ctx.claimRegion(fileRel, regionKey(args.from));
        return { touchedFiles: [fileRel] };
      }

      throw new Error(
        `re-export: ${args.file} already re-exports from "${args.from}" as a ` +
          `${isStar ? "namespace (export *)" : "named"} export; cannot also add the requested ` +
          `${wantsStar ? "namespace" : "named"} re-export. Reconcile the two shapes manually.`,
      );
    }

    if (wantsStar) {
      sf.addExportDeclaration({ moduleSpecifier: args.from });
    } else {
      sf.addExportDeclaration({
        moduleSpecifier: args.from,
        namedExports: wantNames.map((name) => ({ name })),
      });
    }
    ctx.claimRegion(fileRel, regionKey(args.from));
    return { touchedFiles: [fileRel] };
  },

  revert(ctx, args) {
    const fileAbs = resolveBase(ctx, args);
    const fileRel = path.relative(ctx.projectRoot, fileAbs);
    const sf = openOrThrow(ctx, fileAbs);

    const existing = sf
      .getExportDeclarations()
      .find((d: ExportDeclaration) => d.getModuleSpecifierValue() === args.from);
    existing?.remove();

    ctx.releaseRegion(fileRel, regionKey(args.from));
    return { touchedFiles: [fileRel] };
  },
};

function regionKey(from: string): string {
  return `re-exports.${from}`;
}

function resolveBase(
  ctx: Parameters<Codemod<ReExportArgs>["apply"]>[0],
  args: ReExportArgs,
): string {
  if (args.base && args.base.startsWith("package:")) {
    const dir = args.base.slice("package:".length);
    return path.join(ctx.projectRoot, "packages", dir, args.file);
  }
  return path.join(ctx.appRoot, args.file);
}

function openOrThrow(
  ctx: Parameters<Codemod<ReExportArgs>["apply"]>[0],
  fileAbs: string,
): SourceFile {
  try {
    return ctx.project().addSourceFileAtPath(fileAbs);
  } catch {
    throw new Error(
      `re-export: ${fileAbs} not found. The barrel file must exist before re-export runs ` +
        `(typically shipped as a template by another module — e.g. orm-drizzle's schema.ts).`,
    );
  }
}

export default reExport;
