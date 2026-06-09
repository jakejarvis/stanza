// Dotenv/shell key: a leading letter or underscore, then word characters.
// Anything else (newlines, `=`, spaces) can smuggle extra lines into
// `.env.example` or break shell sourcing of the entry.
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Char-scan rather than a regex literal: matches the null-byte style in
// `safe-path.ts` and sidesteps the `no-control-regex` lint.
function hasControlChar(input: string): boolean {
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

// Validate an env var name. Registry-supplied names flow verbatim into
// `.env.example`; a name with a newline would inject extra `KEY=value` lines.
// Returns an error message, or `null` on acceptance.
export function safeEnvName(input: string): string | null {
  if (typeof input !== "string") return "env var name must be a string";
  if (input.length === 0) return "env var name cannot be empty";
  if (!ENV_NAME_RE.test(input)) {
    return "env var name must match ^[A-Za-z_][A-Za-z0-9_]*$";
  }
  return null;
}

// Validate an env var `example` or `description`. Both are written verbatim
// into `.env.example` (the latter as a `# comment`); a control character
// (newline, CR, …) would inject extra lines and smuggle unexpected keys past
// `.env` parsers. Returns an error message, or `null` on acceptance.
export function safeEnvValue(input: string): string | null {
  if (typeof input !== "string") return "env var value must be a string";
  if (hasControlChar(input)) return "env var value cannot contain control characters";
  return null;
}

function assertValid(err: string | null, value: string): void {
  if (err) throw new Error(`${err} (got ${JSON.stringify(value)})`);
}

/**
 * Idempotently append an env var to `.env.example`-style text, returning the
 * new contents. Pure (no fs) so it backs both the CLI's `addEnvVar` and the
 * web builder's preview synthesis — the single source of truth for env-file
 * formatting. Updates an existing var in place; otherwise appends with a blank
 * line separator and an optional leading `# description` comment.
 *
 * Defense-in-depth: rejects malformed `name`/`example`/`description` so a
 * hostile module manifest can't inject extra lines, even if it somehow bypasses
 * schema validation. The schema (`envVarSchema`) enforces the same rules at the
 * registry boundary.
 */
export function appendEnvVar(
  contents: string,
  name: string,
  example: string,
  description?: string,
): string {
  assertValid(safeEnvName(name), name);
  assertValid(safeEnvValue(example), example);
  if (description !== undefined) assertValid(safeEnvValue(description), description);

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
