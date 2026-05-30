---
"stanza-cli": minor
---

Unify registry loading behind a single **main file**, add transactional apply
rollback, and add `stanza doctor`.

- **Registry main file.** A registry is now addressed by the full URL/path to
  its main JSON file (the index), which carries a required `path` on every
  module entry; the loader resolves each module relative to the main file over
  `file://` and `http(s)://` identically. The `modules/<category>-<id>.json`
  naming convention, the `.ts` source-tree loader, the in-repo auto-detect, and
  the inline-template disk fallback are all gone — one loader, no conventions.
  `STANZA_REGISTRY` must be the full path/URL to a main JSON file (not a
  directory). **Breaking** (pre-release, clean break): the registry index is
  now `schemaVersion: 2`, and a third-party `registries` object entry is
  `{ url, headers?, params? }` where `url` is the full main-file URL —
  `indexUrl` and `{category}`/`{id}` URL templating are removed.

- **Auto-rollback.** `stanza add` (and each module in `stanza init`) now wraps
  its file writes in a transaction: if any step throws — including mid-codemod —
  the touched files and `stanza.json` are restored to their pre-apply state
  instead of leaving a partial change.

- **`stanza doctor`.** New read-only command that checks `stanza.json` against
  the filesystem (claimed files/deps/scripts/env vars still present, internal
  packages wired) and reports drift, exiting non-zero when found.
