---
"@stanza/cli": minor
---

Add multi-choice **add-on** modules. A `Module` is now a discriminated union on `kind` (`"slot"` default, or `"addon"` carrying a `category`), and `stanza.json` records add-ons in a new `addons` field keyed by category (each holding 0..n modules). Add-on categories (`testing`, `tooling`, `deploy`, `email`, `monorepo`) are disjoint from slots, so they never constrain another module's adapter dispatch — but they can still target a framework via `peers` + per-framework adapters.

Ships the first two add-ons: `testing-vitest` and `testing-playwright`. They coexist in one project (`stanza add testing vitest`, `stanza add testing playwright`), expose `--testing vitest,playwright` on `stanza init --yes`, and surface as multi-select cards in the web builder. Existing `stanza.json` files are unaffected (the `addons` field defaults to empty).
