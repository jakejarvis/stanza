---
"stanza-cli": minor
"create-stanza": patch
---

Add the **`api`** category to the taxonomy (single-choice, `home: package` → `packages/api/`), matching the documented roadmap for a typed RPC layer between the framework and your services. No first-party modules ship for it yet, so it's inert until a `trpc`/`orpc` module lands — the wizard skips it and the web builder hides it while empty. This is purely additive: `stanza.json`'s schema is unchanged (the `modules` record already keys on arbitrary categories).

`stanza add` now reports a mid-apply failure with recovery guidance instead of a raw stack trace: a region conflict states plainly that nothing was written, while a failure after files were touched points at `stanza remove …` (to sweep what Stanza tracked) and `git restore . && git clean -fd` (to reset a clean worktree) — the latter only suggested when a clean baseline was enforced.

A `STANZA_REGISTRY` pointed at a local directory now loads a **built** JSON registry (`index.json` + `modules/<category>-<id>.json`) when one is present, so a self-hosted on-disk mirror, an air-gapped install, or a CI fixture works under the published binary — previously a filesystem path only resolved raw `module.ts` sources, which the bundled CLI can't import.

Both published packages (`stanza-cli`, `create-stanza`) now ship npm READMEs.
