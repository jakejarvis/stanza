import fs from "node:fs";
import path from "node:path";

import { assertSafeRelativePath } from "@withstanza/utils";

import { type Codemod } from "../index";

/** Comment-line shape used to wrap inserted blocks for idempotency + revert. */
export type CommentStyle = "line" | "hash" | "block";

/**
 * Append a block of text to an existing file, wrapped in stable marker
 * comments so re-apply is a no-op and revert removes exactly what was added.
 *
 * The canonical use is appending models to `prisma/schema.prisma` from an
 * auth module, or adding a CSS `@import` to `globals.css` from a UI module.
 * For TS files we have proper AST codemods; this is for everything else
 * (Prisma, CSS, YAML, plain text) where text-level append with markers
 * gives us robust idempotency without parsing the host format.
 */
export type AppendToFileArgs = {
  /** Path relative to the base directory (see `scope` and `base`). */
  file: string;
  /**
   * Where `file` resolves against:
   *  - `"repo"`: `ctx.projectRoot`
   *  - `"app"` (default): `ctx.appRoot`
   *
   * Mutually exclusive with `base` — set one or the other.
   */
  scope?: "repo" | "app";
  /**
   * Alternative to `scope` for targeting an internal workspace package, e.g.
   * `"package:db"` resolves against `<projectRoot>/packages/db/`. Lets auth
   * modules append to `packages/db/prisma/schema.prisma` without owning it.
   */
  base?: `package:${string}`;
  /** Text content to append. Multi-line strings are common. */
  content: string;
  /**
   * Stable marker uniquely identifying this insertion. The codemod wraps
   * `content` with `<comment> stanza:<marker>:start` ... `:end` lines so
   * the block boundaries are explicit. Required for idempotency + revert.
   */
  marker: string;
  /**
   * Comment syntax to use for the marker lines. Inferred from the file
   * extension when omitted:
   *   - `line` (`//`) for `.ts/.tsx/.js/.mjs/.cjs/.prisma/.scss`
   *   - `block` (`slash-star`) for `.css`
   *   - `hash` (`#`) for `.yaml`, `.yml`, `.toml`, `.sh`, `.bash`, `.env*`, `.dockerignore`, `.gitignore`
   *
   * If the extension isn't in the inferred set, this field is required.
   */
  commentStyle?: CommentStyle;
  /**
   * Where to put the wrapped block:
   *   - `"end"` (default): append to the file. Use for Prisma models, YAML
   *     keys, .env entries — anywhere insertion order doesn't matter.
   *   - `"start"`: prepend before any other content. Required for CSS
   *     `@import` (must be the first rule) and similar header-only directives.
   */
  position?: "start" | "end";
  /**
   * Blank-line padding around the wrapped block. For `position: "end"` this
   * controls whether a blank line is inserted before the block; for
   * `position: "start"` it controls whether a blank line is inserted after.
   * Defaults to `true`.
   */
  leadingBlank?: boolean;
  /**
   * When the target file doesn't exist, create it containing just the wrapped
   * marker block instead of throwing. Only set this for genuinely optional
   * files where a marker-only file is itself valid (`.gitignore`, `.env`,
   * `.dockerignore`). Leave it off for files another module owns (a Prisma
   * schema, a framework's `globals.css`) — there, a missing file is a real
   * peer-ordering bug and the throw should stand.
   */
  createIfMissing?: boolean;
};

const appendToFile: Codemod<AppendToFileArgs> = {
  id: "append-to-file",
  description: "Append text to a file, wrapped in marker comments for idempotency + revert.",

  apply(ctx, args) {
    const { fileAbs, fileRel, comment } = resolve(ctx, args);
    const exists = fs.existsSync(fileAbs);
    if (!exists && !args.createIfMissing) {
      throw new Error(
        `append-to-file: ${fileRel} not found. This is an append primitive; create the file via a template first or pass createIfMissing.`,
      );
    }

    const current = exists ? fs.readFileSync(fileAbs, "utf8") : "";
    const block = wrapBlock(args.content, args.marker, comment);
    const existingRange = findMarkerRange(current, args.marker, comment);

    if (existingRange) {
      const existingBlock = current.slice(existingRange.start, existingRange.end);
      if (normalizeBlock(existingBlock) === normalizeBlock(block)) {
        return { touchedFiles: [] };
      }
      throw new Error(
        `append-to-file: ${fileRel} already has a block marked "${args.marker}" with different content. ` +
          `Reconcile manually or choose a unique marker.`,
      );
    }

    const leadingBlank = args.leadingBlank !== false;
    const position = args.position ?? "end";
    const next =
      position === "start"
        ? prependBlock(current, block, leadingBlank)
        : appendBlock(current, block, leadingBlank);
    // Claim before writing: the runner snapshots the file on claim, and the
    // snapshot must capture the pre-write bytes for rollback to restore them.
    ctx.claimRegion(fileRel, `append.${args.marker}`);
    if (!exists) fs.mkdirSync(path.dirname(fileAbs), { recursive: true });
    fs.writeFileSync(fileAbs, next, "utf8");

    return { touchedFiles: [fileRel] };
  },

  revert(ctx, args) {
    const { fileAbs, fileRel, comment } = resolve(ctx, args);
    if (!fs.existsSync(fileAbs)) return { touchedFiles: [] };

    const current = fs.readFileSync(fileAbs, "utf8");
    const range = findMarkerRange(current, args.marker, comment);
    if (!range) {
      ctx.releaseRegion(fileRel, `append.${args.marker}`);
      return { touchedFiles: [] };
    }

    // Slice out the marked block plus a single trailing newline. Drop one
    // padding blank line on either side if it looks like apply inserted one.
    let start = range.start;
    let end = range.end;
    if (current[end] === "\n") end += 1;
    if (current[end] === "\n") end += 1;
    if (start >= 1 && current[start - 1] === "\n") start -= 1;
    if (start >= 1 && current[start - 1] === "\n") start -= 1;
    const next = current.slice(0, start === 0 ? 0 : start + 1) + current.slice(end);
    fs.writeFileSync(fileAbs, next, "utf8");

    ctx.releaseRegion(fileRel, `append.${args.marker}`);
    return { touchedFiles: [fileRel] };
  },
};

function appendBlock(current: string, block: string, leadingBlank: boolean): string {
  const sep = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  const blank = leadingBlank && current.trimEnd().length > 0 ? "\n" : "";
  return current + sep + blank + block + "\n";
}

function prependBlock(current: string, block: string, trailingBlank: boolean): string {
  // The marker block always ends with its end-tag line; add a trailing newline
  // so the next content starts on its own line, plus an optional blank gap.
  const blank = trailingBlank && current.trimStart().length > 0 ? "\n" : "";
  return block + "\n" + blank + current;
}

function resolve(ctx: Parameters<Codemod<AppendToFileArgs>["apply"]>[0], args: AppendToFileArgs) {
  assertSafeRelativePath(args.file, "append-to-file: args.file");
  const baseAbs = baseDir(ctx, args);
  const fileAbs = path.join(baseAbs, args.file);
  const fileRel = path.relative(ctx.projectRoot, fileAbs);
  const comment = args.commentStyle ?? inferCommentStyle(args.file);
  return { fileAbs, fileRel, comment };
}

function baseDir(
  ctx: Parameters<Codemod<AppendToFileArgs>["apply"]>[0],
  args: AppendToFileArgs,
): string {
  if (args.base && args.base.startsWith("package:")) {
    const dir = args.base.slice("package:".length);
    assertSafeRelativePath(dir, "append-to-file: args.base package dir");
    return path.join(ctx.projectRoot, "packages", dir);
  }
  const scope = args.scope ?? "app";
  return scope === "repo" ? ctx.projectRoot : ctx.appRoot;
}

/**
 * Inferred comment syntax per file extension. Returning `undefined` here
 * means the caller has to pass `commentStyle` explicitly.
 */
function inferCommentStyle(file: string): CommentStyle {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file).toLowerCase();
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".prisma", ".scss"].includes(ext)) {
    return "line";
  }
  if (ext === ".css") return "block";
  if (
    [".yaml", ".yml", ".toml", ".sh", ".bash"].includes(ext) ||
    base === ".dockerignore" ||
    base === ".gitignore" ||
    base.startsWith(".env")
  ) {
    return "hash";
  }
  throw new Error(
    `append-to-file: cannot infer a comment style for ${file}. Pass an explicit \`commentStyle\`.`,
  );
}

function wrapBlock(content: string, marker: string, style: CommentStyle): string {
  const tag = (kind: "start" | "end") => commentLine(style, `stanza:${marker}:${kind}`);
  const trimmed = content.replace(/^\n+/, "").replace(/\n+$/, "");
  return `${tag("start")}\n${trimmed}\n${tag("end")}`;
}

function commentLine(style: CommentStyle, body: string): string {
  switch (style) {
    case "line":
      return `// ${body}`;
    case "hash":
      return `# ${body}`;
    case "block":
      return `/* ${body} */`;
    default:
      style satisfies never;
      throw new Error(`append-to-file: unknown comment style ${String(style)}`);
  }
}

/**
 * Locate the `[start, end)` byte range of an existing marked block. Returns
 * `undefined` if the start marker isn't found. Throws if a start exists
 * without a matching end (malformed file from prior interrupted run).
 */
function findMarkerRange(
  current: string,
  marker: string,
  style: CommentStyle,
): { start: number; end: number } | undefined {
  const startTag = commentLine(style, `stanza:${marker}:start`);
  const endTag = commentLine(style, `stanza:${marker}:end`);
  const startIdx = current.indexOf(startTag);
  if (startIdx === -1) return undefined;

  const endIdx = current.indexOf(endTag, startIdx + startTag.length);
  if (endIdx === -1) {
    throw new Error(
      `append-to-file: found "${startTag}" but no matching "${endTag}". Fix the file manually.`,
    );
  }
  return { start: startIdx, end: endIdx + endTag.length };
}

/** Whitespace-normalize for content equality checks. */
function normalizeBlock(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export default appendToFile;
