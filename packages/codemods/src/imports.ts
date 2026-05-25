import type { SourceFile } from "ts-morph";

/** Plain name (`useState`) or aliased (`{ name: "polar", alias: "polarClient" }`). */
export type NamedImportSpec = string | { name: string; alias?: string };

const namedImportKey = (name: string, alias: string | undefined): string =>
  `${name}|${alias ?? ""}`;

/**
 * Idempotently add a named import. If the module specifier is already
 * imported, merges the named entries; otherwise inserts a new import after
 * the last existing import statement. Aliased and plain forms coexist —
 * `polar` and `polar as polarClient` from the same module are treated as
 * distinct entries (same name, different local binding).
 */
export function addNamedImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  named: NamedImportSpec | NamedImportSpec[],
): void {
  const list = Array.isArray(named) ? named : [named];
  const normalized = list.map((n) => (typeof n === "string" ? { name: n } : n));
  const existing = sourceFile.getImportDeclaration(
    (decl) => decl.getModuleSpecifierValue() === moduleSpecifier,
  );

  if (existing) {
    const already = new Set(
      existing
        .getNamedImports()
        .map((n) => namedImportKey(n.getName(), n.getAliasNode()?.getText())),
    );
    const toAdd = normalized.filter((spec) => !already.has(namedImportKey(spec.name, spec.alias)));
    if (toAdd.length > 0) {
      existing.addNamedImports(toAdd.map((spec) => ({ name: spec.name, alias: spec.alias })));
    }
    return;
  }

  sourceFile.addImportDeclaration({
    moduleSpecifier,
    namedImports: normalized.map((spec) => ({ name: spec.name, alias: spec.alias })),
  });
}

export function addDefaultImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  defaultName: string,
): void {
  const existing = sourceFile.getImportDeclaration(
    (decl) => decl.getModuleSpecifierValue() === moduleSpecifier,
  );

  if (existing) {
    if (!existing.getDefaultImport()) {
      existing.setDefaultImport(defaultName);
    }
    return;
  }

  sourceFile.addImportDeclaration({
    moduleSpecifier,
    defaultImport: defaultName,
  });
}

export function removeImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  named?: string[],
): void {
  const existing = sourceFile.getImportDeclaration(
    (decl) => decl.getModuleSpecifierValue() === moduleSpecifier,
  );
  if (!existing) return;

  if (!named) {
    existing.remove();
    return;
  }

  const toRemove = new Set(named);
  existing
    .getNamedImports()
    .filter((n) => toRemove.has(n.getName()))
    .forEach((n) => n.remove());

  // If we removed everything and no default, drop the declaration.
  if (
    existing.getNamedImports().length === 0 &&
    !existing.getDefaultImport() &&
    !existing.getNamespaceImport()
  ) {
    existing.remove();
  }
}
