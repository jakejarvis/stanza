// Reject anything that could escape the intended root: absolute paths,
// `..` segments, null bytes. Registry-supplied paths flow into `fs.writeFile`
// and `addSourceFileAtPath`; a hostile third-party manifest with
// `dest: "../../../home/<user>/.ssh/..."` would otherwise be honored.
// Returns an error message, or `null` on acceptance.
export function safeRelativePath(input: string): string | null {
  if (typeof input !== "string") return "path must be a string";
  if (input.length === 0) return "path cannot be empty";
  if (input.includes("\0")) return "path cannot contain null bytes";
  if (input.startsWith("/") || input.startsWith("\\")) return "path must be relative";
  if (/^[a-zA-Z]:[/\\]/.test(input)) return "path must be relative";
  const segments = input.replaceAll("\\", "/").split("/");
  for (const seg of segments) {
    if (seg === "..") return "path cannot escape with `..`";
  }
  return null;
}

export function assertSafeRelativePath(input: string, label: string): void {
  const err = safeRelativePath(input);
  if (err) throw new Error(`${label}: ${err} (got ${JSON.stringify(input)})`);
}
