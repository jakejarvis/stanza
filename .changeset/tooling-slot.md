---
"@stanza/cli": minor
---

Add a single-choice **tooling** slot for the lint/format toolchain, with three modules: `eslint-prettier` (ESLint flat config + Prettier, per-framework adapters), `biome`, and `oxlint-oxfmt` (both framework-agnostic). Modeled as a slot rather than a multi-choice add-on because the three toolchains are mutually exclusive substitutes.

Also drops the stale `lint: "next lint"` script from the `framework-next` module — `next lint` was removed in Next 16 — so a tooling pick owns `scripts.lint` cleanly. The CLI gains `--tooling <id>` on `stanza init --yes` and the web builder renders a single-select "Tooling" card, both automatically from the slot taxonomy.
