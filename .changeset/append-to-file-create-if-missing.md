---
"stanza-cli": patch
---

Fix `stanza add monorepo turbo` hard-failing on existing projects that lack a root `.gitignore`.

The `append-to-file` codemod gains an optional `createIfMissing` arg: when set and the target file is absent, it creates the file containing just the wrapped marker block instead of throwing. `monorepo-turbo` now passes `createIfMissing: true` for its `.turbo/` `.gitignore` entry, so `stanza add monorepo turbo` works on a pre-existing project with no `.gitignore` (previously the whole add rolled back). The flag is additive and off by default — modules appending to peer-owned files (a Prisma schema, a framework's `globals.css`) keep the original "missing file is a peer-ordering bug" throw.
