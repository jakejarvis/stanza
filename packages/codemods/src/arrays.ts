import { type SourceFile, SyntaxKind, type ArrayLiteralExpression } from "ts-morph";

/**
 * Add an element to an array literal exported (or assigned to) under a
 * specific name. Idempotent — won't duplicate identical text.
 */
export function addArrayElement(
  sourceFile: SourceFile,
  exportedName: string,
  elementText: string,
): void {
  const arr = findArrayLiteral(sourceFile, exportedName);
  if (!arr) {
    throw new Error(
      `addArrayElement: no array literal named "${exportedName}" found in ${sourceFile.getFilePath()}`,
    );
  }

  const existing = arr.getElements().map((e) => e.getText().trim());
  if (existing.includes(elementText.trim())) return;

  arr.addElement(elementText);
}

export function removeArrayElement(
  sourceFile: SourceFile,
  exportedName: string,
  elementText: string,
): void {
  const arr = findArrayLiteral(sourceFile, exportedName);
  if (!arr) return;

  const target = elementText.trim();
  arr
    .getElements()
    .filter((e) => e.getText().trim() === target)
    .forEach((e) => arr.removeElement(e));
}

function findArrayLiteral(
  sourceFile: SourceFile,
  name: string,
): ArrayLiteralExpression | undefined {
  // export const X = [...]
  const v = sourceFile.getVariableDeclaration(name);
  if (v) {
    const init = v.getInitializer();
    if (init?.isKind(SyntaxKind.ArrayLiteralExpression)) {
      return init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    }
  }

  // export default [...]
  if (name === "default") {
    const def = sourceFile.getExportAssignment(() => true);
    const init = def?.getExpression();
    if (init?.isKind(SyntaxKind.ArrayLiteralExpression)) {
      return init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    }
  }

  return undefined;
}
