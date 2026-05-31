import fs from "node:fs";

import { appendEnvVar } from "@withstanza/utils";

/**
 * Idempotently append an env var to a .env.example-style file. Preserves
 * existing entries; updates the example value in-place if the var already
 * exists; adds a leading comment if `description` is supplied. Formatting is
 * delegated to `appendEnvVar` (pure, in `@withstanza/utils`) so the CLI and the
 * web builder's preview produce identical files.
 */
export function addEnvVar(
  envFile: string,
  name: string,
  example: string,
  description?: string,
): void {
  const contents = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  fs.writeFileSync(envFile, appendEnvVar(contents, name, example, description), "utf8");
}

export function removeEnvVar(envFile: string, name: string): void {
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, "utf8").split("\n");
  const idx = lines.findIndex((line) => line.replace(/^#\s*/, "").startsWith(`${name}=`));
  if (idx < 0) return;

  // Remove the var line and a preceding standalone comment if it looks attached.
  const prev = lines[idx - 1];
  if (prev?.startsWith("#") && (lines[idx - 2] === "" || idx - 2 < 0)) {
    lines.splice(idx - 1, 2);
  } else {
    lines.splice(idx, 1);
  }

  fs.writeFileSync(envFile, lines.join("\n"), "utf8");
}
