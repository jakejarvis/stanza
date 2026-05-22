---
"stanza-cli": minor
---

Add a single-choice **tooling** slot for the lint/format toolchain, with three modules: `eslint-prettier` (ESLint flat config + Prettier, per-framework adapters), `biome`, and `oxlint-oxfmt` (both framework-agnostic). Modeled as a slot rather than a multi-choice add-on because the three toolchains are mutually exclusive substitutes.

Introduces **repo-scoped** slots (`repoScoped: true` on a `Slot`): their config files land at the monorepo root and their scripts/devDependencies merge into the root `package.json`, since one lint/format config governs every workspace. This is a third install home alongside app-scoped and package-scoped slots.

Also drops the stale `lint: "next lint"` script from the `framework-next` module — `next lint` was removed in Next 16 — so a tooling pick owns the root `lint`/`format` scripts cleanly. The CLI gains `--tooling <id>` on `stanza init --yes` and the web builder renders a single-select "Tooling" card, both automatically from the slot taxonomy.
