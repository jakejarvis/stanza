import fs from "node:fs";

/**
 * Idempotently append an env var to a .env.example-style file. Preserves
 * existing entries; updates the example value in-place if the var already
 * exists; adds a leading comment if `description` is supplied.
 */
export function addEnvVar(
  envFile: string,
  name: string,
  example: string,
  description?: string,
): void {
  const contents = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const lines = contents.split("\n");

  const existingIdx = lines.findIndex((line) => line.replace(/^#\s*/, "").startsWith(`${name}=`));

  const entry = description ? `# ${description}\n${name}=${example}` : `${name}=${example}`;

  if (existingIdx >= 0) {
    // Replace existing line (and a preceding comment if present and matches description).
    const prev = lines[existingIdx - 1];
    if (description && prev?.startsWith("#")) {
      lines.splice(existingIdx - 1, 2, ...entry.split("\n"));
    } else {
      lines.splice(existingIdx, 1, ...entry.split("\n"));
    }
  } else {
    if (contents.length > 0 && !contents.endsWith("\n")) lines.push("");
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    lines.push(...entry.split("\n"));
  }

  fs.writeFileSync(envFile, lines.join("\n").replace(/\n+$/, "\n"), "utf8");
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
