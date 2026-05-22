import { execFileSync } from "node:child_process";

import * as p from "@clack/prompts";
import pc from "picocolors";

export type WorktreeStatus = { dirty: false } | { dirty: true; changes: string[] };

/**
 * Reports whether `dir` sits in a git work tree with uncommitted changes.
 * When git is missing or `dir` isn't a repo there's nothing to protect, so we
 * report clean — the guard only exists to keep our edits in a reviewable diff.
 */
export function worktreeStatus(dir: string): WorktreeStatus {
  let insideWorkTree = "";
  try {
    insideWorkTree = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return { dirty: false };
  }
  if (insideWorkTree !== "true") return { dirty: false };

  const out = execFileSync("git", ["status", "--porcelain"], {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const changes = out
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter(Boolean);
  return changes.length === 0 ? { dirty: false } : { dirty: true, changes };
}

/**
 * Returns true when it's safe to mutate files in `dir`. If the work tree is
 * dirty and the `--dangerously-allow-dirty` override isn't set, prints an
 * explanation and returns false so the caller can bail before writing anything.
 */
export function ensureCleanWorktree(dir: string, allowDirty: boolean): boolean {
  const status = worktreeStatus(dir);
  if (!status.dirty) return true;
  if (allowDirty) {
    p.log.warn(pc.yellow("[dangerously-allow-dirty] proceeding despite uncommitted changes."));
    return true;
  }

  const preview = status.changes.slice(0, 10);
  const more = status.changes.length - preview.length;
  p.log.error(
    [
      "Refusing to run: the git working tree has uncommitted changes.",
      "Commit or stash them first so this command's edits land in their own reviewable diff.",
      "",
      ...preview.map((c) => `  ${c}`),
      ...(more > 0 ? [`  …and ${more} more`] : []),
      "",
      `Re-run with ${pc.cyan("--dangerously-allow-dirty")} to override.`,
    ].join("\n"),
  );
  return false;
}
