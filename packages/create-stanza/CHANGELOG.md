# create-stanza

## 0.1.2

### Patch Changes

- Updated dependencies [[`e776dc7`](https://github.com/jakejarvis/stanza/commit/e776dc74f6f76a897e2c3f473f44f46317d0d31b), [`6ada5c0`](https://github.com/jakejarvis/stanza/commit/6ada5c0a88bc86567ba7db7be9aa7d88bbbaed07), [`dc34c92`](https://github.com/jakejarvis/stanza/commit/dc34c92c21495966d1f2df2052aac27c6d6c5719), [`e776dc7`](https://github.com/jakejarvis/stanza/commit/e776dc74f6f76a897e2c3f473f44f46317d0d31b), [`e776dc7`](https://github.com/jakejarvis/stanza/commit/e776dc74f6f76a897e2c3f473f44f46317d0d31b), [`e776dc7`](https://github.com/jakejarvis/stanza/commit/e776dc74f6f76a897e2c3f473f44f46317d0d31b)]:
  - stanza-cli@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`04a196e`](https://github.com/jakejarvis/stanza/commit/04a196e4e9f3e4ea65445a191421f643d1fe3510), [`ea2d8c4`](https://github.com/jakejarvis/stanza/commit/ea2d8c45bdde5df23005f4b739b7c5d029e9be2d), [`04a196e`](https://github.com/jakejarvis/stanza/commit/04a196e4e9f3e4ea65445a191421f643d1fe3510)]:
  - stanza-cli@0.1.1

## 0.1.0

### Minor Changes

- [`7349b53`](https://github.com/jakejarvis/stanza/commit/7349b53b82dc987873cb75baef92261cc08e2f82) - Add the **`api`** category to the taxonomy (single-choice, `home: package` → `packages/api/`), matching the documented roadmap for a typed RPC layer between the framework and your services. No first-party modules ship for it yet, so it's inert until a `trpc`/`orpc` module lands — the wizard skips it and the web builder hides it while empty. This is purely additive: `stanza.json`'s schema is unchanged (the `modules` record already keys on arbitrary categories).

  Both published packages (`stanza-cli`, `create-stanza`) now ship npm READMEs. `stanza-cli` also exposes a `stanza-cli` binary alongside the primary `stanza` command, so `npx stanza-cli …` (and `bunx` / `pnpm dlx` / `yarn dlx`) resolve predictably regardless of how each runner handles a single differently-named bin.

### Patch Changes

- Updated dependencies [[`19b5e51`](https://github.com/jakejarvis/stanza/commit/19b5e51075383e7c7fda14eb5182d8bdb13be7cb), [`7349b53`](https://github.com/jakejarvis/stanza/commit/7349b53b82dc987873cb75baef92261cc08e2f82), [`71f4c9d`](https://github.com/jakejarvis/stanza/commit/71f4c9d89b4cf863bbb5a1fb3889024f9a0a01b6), [`e89fb63`](https://github.com/jakejarvis/stanza/commit/e89fb63c3128343346a0f5530901e333a4001b13), [`8c5433a`](https://github.com/jakejarvis/stanza/commit/8c5433aa3cf120a86b8cf3a7702ba6de0a005bd6), [`65c02d4`](https://github.com/jakejarvis/stanza/commit/65c02d4a46406d8f2f97a238c8226e2a0e3001e7)]:
  - stanza-cli@0.1.0
