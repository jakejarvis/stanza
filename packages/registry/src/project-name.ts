import validateNpmPackageName from "validate-npm-package-name";

export type ProjectNameValidation = { ok: true } | { ok: false; message: string };

/**
 * Validate a stanza project name. Wraps `validate-npm-package-name` but rejects
 * scoped (`@scope/name`) shapes — stanza synthesizes the scope itself for slot
 * packages (e.g. `@<name>/db`), so the user provides only the bare name.
 */
export function validateProjectName(raw: string): ProjectNameValidation {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, message: "name is required" };
  if (name.includes("/") || name.startsWith("@")) {
    return { ok: false, message: "name cannot be scoped" };
  }
  const result = validateNpmPackageName(name);
  if (result.validForNewPackages) return { ok: true };
  const message = result.errors?.[0] ?? result.warnings?.[0] ?? "name is invalid";
  return { ok: false, message };
}
