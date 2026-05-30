---
"stanza-cli": minor
"create-stanza": minor
---

Add the **`api`** category to the taxonomy (single-choice, `home: package` → `packages/api/`), matching the documented roadmap for a typed RPC layer between the framework and your services. No first-party modules ship for it yet, so it's inert until a `trpc`/`orpc` module lands — the wizard skips it and the web builder hides it while empty. This is purely additive: `stanza.json`'s schema is unchanged (the `modules` record already keys on arbitrary categories).

Both published packages (`stanza-cli`, `create-stanza`) now ship npm READMEs. `stanza-cli` also exposes a `stanza-cli` binary alongside the primary `stanza` command, so `npx stanza-cli …` (and `bunx` / `pnpm dlx` / `yarn dlx`) resolve predictably regardless of how each runner handles a single differently-named bin.
