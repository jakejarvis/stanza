import fs from "node:fs";

type Snapshot = { existed: true; content: Buffer } | { existed: false };

/**
 * Records the pre-write state of files so a failed multi-file mutation can be
 * rolled back to where it started. `snapshot(path)` captures a file's current
 * bytes (or its absence) the FIRST time it's seen — later snapshots of the same
 * path are ignored, so the recorded state is always the pre-transaction one.
 * `rollback()` restores every snapshotted path: rewrite the original bytes, or
 * delete files that didn't exist before.
 *
 * Newly-created directories are intentionally left behind (empty dirs are inert
 * and re-creating the package re-bootstraps cleanly); the contract is "no stray
 * files", not "no stray dirs".
 */
export class FileTx {
  private readonly snapshots = new Map<string, Snapshot>();

  /** Capture the current on-disk state of `absPath` (idempotent per path). */
  snapshot(absPath: string): void {
    if (this.snapshots.has(absPath)) return;
    this.snapshots.set(
      absPath,
      fs.existsSync(absPath)
        ? { existed: true, content: fs.readFileSync(absPath) }
        : { existed: false },
    );
  }

  /** Restore every snapshotted path to its captured state. Idempotent. */
  rollback(): void {
    for (const [absPath, snap] of this.snapshots) {
      if (snap.existed) {
        fs.writeFileSync(absPath, snap.content);
      } else if (fs.existsSync(absPath)) {
        fs.rmSync(absPath, { force: true });
      }
    }
    this.snapshots.clear();
  }
}
