import type { SourceFile } from "ts-morph";

/**
 * Idempotently add a named import. If the module specifier is already
 * imported, merges the named entries; otherwise inserts a new import after
 * the last existing import statement.
 */
export function addNamedImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  named: string | string[],
): void {
  const names = Array.isArray(named) ? named : [named];
  const existing = sourceFile.getImportDeclaration(
    (decl) => decl.getModuleSpecifierValue() === moduleSpecifier,
  );

  if (existing) {
    const already = new Set(existing.getNamedImports().map((n) => n.getName()));
    const toAdd = names.filter((n) => !already.has(n));
    if (toAdd.length > 0) {
      existing.addNamedImports(toAdd.map((name) => ({ name })));
    }
    return;
  }

  sourceFile.addImportDeclaration({
    moduleSpecifier,
    namedImports: names.map((name) => ({ name })),
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
