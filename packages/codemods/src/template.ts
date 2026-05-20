import fs from "node:fs";
import path from "node:path";

/**
 * Minimal mustache-style template renderer — `{{ name }}` only. Intentionally
 * no logic helpers; templates that need branching should live as separate
 * files and the codemod picks which one to render.
 */
export function renderTemplate(source: string, context: Record<string, string>): string {
  return source.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    const value = context[key];
    if (value === undefined) {
      throw new Error(`renderTemplate: missing key "${key}"`);
    }
    return value;
  });
}

export function writeTemplateFile(
  sourcePath: string,
  destPath: string,
  context: Record<string, string> | undefined,
  options: { overwrite?: boolean } = {},
): void {
  if (!options.overwrite && fs.existsSync(destPath)) {
    throw new Error(`writeTemplateFile: refusing to overwrite existing file: ${destPath}`);
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const raw = fs.readFileSync(sourcePath, "utf8");
  const rendered = context ? renderTemplate(raw, context) : raw;
  fs.writeFileSync(destPath, rendered, "utf8");
}
