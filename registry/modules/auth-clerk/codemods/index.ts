import path from "node:path";

import { type Codemod, SyntaxKind, addNamedImport } from "@stanza/codemods";

const LAYOUT_REL_FROM_APP = "app/layout.tsx";
const PROVIDER_NAME = "ClerkRootProvider";
const PROVIDER_IMPORT = "./_clerk-provider";

const wrapRootLayout: Codemod = {
  id: "wrap-root-layout",
  description: "Wrap {children} in app/layout.tsx with <ClerkRootProvider>.",

  apply(ctx) {
    const layoutAbs = path.join(ctx.appRoot, LAYOUT_REL_FROM_APP);
    const layoutRel = path.relative(ctx.projectRoot, layoutAbs);
    const sf = ctx.project().addSourceFileAtPath(layoutAbs);

    // Idempotency guard: if the provider is already wired up, do nothing.
    if (sf.getText().includes(PROVIDER_NAME)) {
      return { touchedFiles: [] };
    }

    addNamedImport(sf, PROVIDER_IMPORT, PROVIDER_NAME);

    // Find the bare `{children}` JsxExpression and wrap it. We match exactly
    // — anything that's already been edited (e.g. wrapped by another module)
    // won't match this literal, which is the desired safety property.
    const wrapped = `<${PROVIDER_NAME}>{children}</${PROVIDER_NAME}>`;
    let wrappedAny = false;
    for (const node of sf.getDescendantsOfKind(SyntaxKind.JsxExpression)) {
      if (node.getText().replace(/\s+/g, "") === "{children}") {
        node.replaceWithText(wrapped);
        wrappedAny = true;
        break;
      }
    }

    if (!wrappedAny) {
      // The layout has been customized; we can't safely auto-wrap. Surface
      // the situation rather than silently shipping a broken auth setup.
      throw new Error(
        `Could not find \`{children}\` in ${layoutRel} to wrap with <${PROVIDER_NAME}>. ` +
          `If you've customized the layout, wrap children with <${PROVIDER_NAME}> manually.`,
      );
    }

    ctx.claimRegion(layoutRel, "imports.clerk-provider");
    ctx.claimRegion(layoutRel, "providers.clerk");

    return { touchedFiles: [layoutRel] };
  },

  revert(ctx) {
    const layoutAbs = path.join(ctx.appRoot, LAYOUT_REL_FROM_APP);
    const layoutRel = path.relative(ctx.projectRoot, layoutAbs);
    const sf = ctx.project().addSourceFileAtPath(layoutAbs);

    // Remove the import.
    const importDecl = sf.getImportDeclaration(
      (d) => d.getModuleSpecifierValue() === PROVIDER_IMPORT,
    );
    importDecl?.remove();

    // Unwrap the JSX back to bare `{children}`. We match the exact text we
    // would have written, so user edits to the wrapped block won't be touched.
    const wrapped = `<${PROVIDER_NAME}>{children}</${PROVIDER_NAME}>`;
    for (const node of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
      if (node.getText().replace(/\s+/g, "") === wrapped) {
        node.replaceWithText("{children}");
        break;
      }
    }

    ctx.releaseRegion(layoutRel, "imports.clerk-provider");
    ctx.releaseRegion(layoutRel, "providers.clerk");

    return { touchedFiles: [layoutRel] };
  },
};

export default {
  "wrap-root-layout": wrapRootLayout,
};
