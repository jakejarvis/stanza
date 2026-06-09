---
"@withstanza/schema": patch
"stanza-cli": patch
---

Guard `regions` file keys against path traversal and symlink escape. `stanza remove` deletes files using the region keys read from `stanza.json`, but those outer keys were previously an unvalidated `z.string()` — a crafted/attacker-authored manifest (cloning an untrusted repo, CI automation) could set a region key to `"../../etc/evil"` and make `remove` `unlinkSync` a path outside the project. The `regions` record key is now validated with `safeRelativePath` at parse time (rejecting `..`, absolute paths, and null bytes, so `remove` refuses the manifest on read), and the remove command re-checks each region key and asserts the resolved real path stays within the project root after symlink resolution before any delete sink — closing a symlinked-directory escape that a lexical check alone misses (sibling to the `app.dir` guard).
