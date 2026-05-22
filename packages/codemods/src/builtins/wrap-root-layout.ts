import path from "node:path";

import { selectedOne } from "@stanza/registry";

import {
  addDefaultImport,
  addNamedImport,
  type Codemod,
  type ImportDeclaration,
  SyntaxKind,
} from "../index";

/**
 * Wrap the framework's root-layout file's children with a provider element.
 *
 * Dispatches per framework — Next App Router uses `app/layout.tsx` with a
 * bare `{children}` JsxExpression; TanStack Start uses
 * `src/routes/__root.tsx` with `<Outlet />`. Adding a new framework means
 * extending `frameworkTarget()` below; modules don't have to know.
 */
export type WrapRootLayoutArgs = {
  /** The JSX element name to wrap children with (e.g. `"ClerkRootProvider"`). */
  providerName: string;
  /** Module specifier the provider is imported from (e.g. `"./_clerk-provider"`). */
  providerImport: string;
  /** `"named"` (default) or `"default"` — controls the import style. */
  importKind?: "named" | "default";
};

type FrameworkTarget = {
  /** Repo-relative path to the layout file. */
  relPath: string;
  /** Exact JSX-expression text we look for to wrap. */
  childrenMarker: string;
  /** ts-morph SyntaxKind to scan — JsxExpression for `{children}`, JsxSelfClosingElement for `<Outlet />`. */
  markerKind: SyntaxKind;
};

const wrapRootLayout: Codemod<WrapRootLayoutArgs> = {
  id: "wrap-root-layout",
  description: "Wrap the root layout's children with a provider element.",

  apply(ctx, args) {
    const target = frameworkTarget(selectedOne(ctx.manifest, "framework")?.id);
    if (!target) {
      throw new Error(
        `wrap-root-layout: framework "${selectedOne(ctx.manifest, "framework")?.id ?? "<unset>"}" not supported. ` +
          `Add a case in frameworkTarget() to enable.`,
      );
    }

    const layoutAbs = path.join(ctx.appRoot, target.relPath);
    const layoutRel = path.relative(ctx.projectRoot, layoutAbs);
    const sf = ctx.project().addSourceFileAtPath(layoutAbs);

    // Idempotency: if the provider is already present, treat as no-op.
    if (sf.getText().includes(args.providerName)) return { touchedFiles: [] };

    if (args.importKind === "default") {
      addDefaultImport(sf, args.providerImport, args.providerName);
    } else {
      addNamedImport(sf, args.providerImport, args.providerName);
    }

    const wrapped = `<${args.providerName}>${target.childrenMarker}</${args.providerName}>`;
    let wrappedAny = false;
    for (const node of sf.getDescendantsOfKind(target.markerKind)) {
      if (normalize(node.getText()) === normalize(target.childrenMarker)) {
        node.replaceWithText(wrapped);
        wrappedAny = true;
        break;
      }
    }

    if (!wrappedAny) {
      throw new Error(
        `wrap-root-layout: could not find \`${target.childrenMarker}\` in ${layoutRel} to wrap with <${args.providerName}>. ` +
          `If you've customized the layout, wrap children manually.`,
      );
    }

    ctx.claimRegion(layoutRel, `imports.${args.providerName}`);
    ctx.claimRegion(layoutRel, `providers.${args.providerName}`);

    return { touchedFiles: [layoutRel] };
  },

  revert(ctx, args) {
    const target = frameworkTarget(selectedOne(ctx.manifest, "framework")?.id);
    if (!target) return { touchedFiles: [] };

    const layoutAbs = path.join(ctx.appRoot, target.relPath);
    const layoutRel = path.relative(ctx.projectRoot, layoutAbs);
    const sf = ctx.project().addSourceFileAtPath(layoutAbs);

    const importDecl = sf.getImportDeclaration(
      (d: ImportDeclaration) => d.getModuleSpecifierValue() === args.providerImport,
    );
    importDecl?.remove();

    const wrapped = `<${args.providerName}>${target.childrenMarker}</${args.providerName}>`;
    for (const node of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
      if (normalize(node.getText()) === normalize(wrapped)) {
        node.replaceWithText(target.childrenMarker);
        break;
      }
    }

    ctx.releaseRegion(layoutRel, `imports.${args.providerName}`);
    ctx.releaseRegion(layoutRel, `providers.${args.providerName}`);

    return { touchedFiles: [layoutRel] };
  },
};

function frameworkTarget(frameworkId: string | undefined): FrameworkTarget | undefined {
  switch (frameworkId) {
    case "next":
      return {
        relPath: "app/layout.tsx",
        childrenMarker: "{children}",
        markerKind: SyntaxKind.JsxExpression,
      };
    case "tanstack-start":
      return {
        relPath: "src/routes/__root.tsx",
        childrenMarker: "<Outlet />",
        markerKind: SyntaxKind.JsxSelfClosingElement,
      };
    default:
      return undefined;
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "");
}

export default wrapRootLayout;
