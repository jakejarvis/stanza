---
"stanza-cli": patch
---

Fix a batch of correctness bugs found in a critical-bug sweep:

- `stanza init --dry-run` no longer writes anything (previously it created the project directory, monorepo shell, and `stanza.json` despite saying "no files will be written").
- Direct-fs codemods (`append-to-file`, `add-package-dep`, `set-tsconfig-paths`) claim their region **before** writing, so a failed `add` rolls files back to their true pre-apply bytes and `RegionConflictError` fires before any disk change.
- `stanza remove`'s package-sweep guard reads the `consumesPackages` snapshot persisted on each installed record (falling back to a registry fetch only for legacy records), so a `packages/<dir>/` still imported by an installed module is protected even offline or after an upstream rename.
- `stanza remove` only applies the legacy bare-id owner fallback when no sibling install of the same module remains, so removing one app's install on a pre-composite-owner manifest can no longer sweep another app's files.
- `stanza doctor` no longer reports false drift for package-home modules installed with an `--app` restriction.
- `wrap-root-layout` resolves the framework per dispatched app, fixing multi-app projects with differing frameworks.
- The template/codemod render context carries the project's `packageManager`, so `{{pm}}`/`{{run …}}` render bun/npm commands instead of always pnpm.
