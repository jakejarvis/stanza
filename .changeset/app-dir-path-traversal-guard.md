---
"@withstanza/schema": patch
"stanza-cli": patch
---

Guard `app.dir` against path traversal and symlink escape. The manifest's `apps[].dir` is joined onto the project root for every write into an app, but was previously an unvalidated `z.string()` — a crafted/attacker-authored `stanza.json` (cloning an untrusted repo, CI automation) could set `dir: "../../etc"` and land template files outside the project. `appSpecSchema` now validates `dir` with `safeRelativePath` at parse time (rejecting `..`, absolute paths, and null bytes, so both `add` and `remove` refuse the manifest on read), and `applyModule` re-checks each target app's `dir` and asserts every resolved write destination stays within the project root after symlink resolution — closing a symlinked-app-dir escape that a lexical check alone misses.
