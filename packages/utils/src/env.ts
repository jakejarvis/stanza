/**
 * Idempotently append an env var to `.env.example`-style text, returning the
 * new contents. Pure (no fs) so it backs both the CLI's `addEnvVar` and the
 * web builder's preview synthesis — the single source of truth for env-file
 * formatting. Updates an existing var in place; otherwise appends with a blank
 * line separator and an optional leading `# description` comment.
 */
export function appendEnvVar(
  contents: string,
  name: string,
  example: string,
  description?: string,
): string {
  const lines = contents.split("\n");
  const existingIdx = lines.findIndex((line) => line.replace(/^#\s*/, "").startsWith(`${name}=`));
  const entry = description ? `# ${description}\n${name}=${example}` : `${name}=${example}`;

  if (existingIdx >= 0) {
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

  return lines.join("\n").replace(/\n+$/, "\n");
}
