# create-stanza

## 0.1.0

### Minor Changes

- [`7349b53`](https://github.com/jakejarvis/stanza/commit/7349b53b82dc987873cb75baef92261cc08e2f82) - Add the **`api`** category to the taxonomy (single-choice, `home: package` → `packages/api/`), matching the documented roadmap for a typed RPC layer between the framework and your services. No first-party modules ship for it yet, so it's inert until a `trpc`/`orpc` module lands — the wizard skips it and the web builder hides it while empty. This is purely additive: `stanza.json`'s schema is unchanged (the `modules` record already keys on arbitrary categories).

  Both published packages (`stanza-cli`, `create-stanza`) now ship npm READMEs. `stanza-cli` also exposes a `stanza-cli` binary alongside the primary `stanza` command, so `npx stanza-cli …` (and `bunx` / `pnpm dlx` / `yarn dlx`) resolve predictably regardless of how each runner handles a single differently-named bin.

### Patch Changes

- Updated dependencies [[`19b5e51`](https://github.com/jakejarvis/stanza/commit/19b5e51075383e7c7fda14eb5182d8bdb13be7cb), [`7349b53`](https://github.com/jakejarvis/stanza/commit/7349b53b82dc987873cb75baef92261cc08e2f82), [`71f4c9d`](https://github.com/jakejarvis/stanza/commit/71f4c9d89b4cf863bbb5a1fb3889024f9a0a01b6), [`e89fb63`](https://github.com/jakejarvis/stanza/commit/e89fb63c3128343346a0f5530901e333a4001b13), [`8c5433a`](https://github.com/jakejarvis/stanza/commit/8c5433aa3cf120a86b8cf3a7702ba6de0a005bd6), [`65c02d4`](https://github.com/jakejarvis/stanza/commit/65c02d4a46406d8f2f97a238c8226e2a0e3001e7)]:
  - stanza-cli@0.1.0
