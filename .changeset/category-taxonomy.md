---
"stanza-cli": minor
---

Unify the module taxonomy into one `Category` concept. The old slot/add-on split
conflated two orthogonal properties; categories now carry them explicitly:
`cardinality` (`"one"` single-choice / `"many"` coexisting) and `home`
(`app` / `repo` / `package`, a tagged union replacing the `packageDir` +
`repoScoped` pair). A `Module` is no longer a discriminated union — it carries a
single `category` field.

The manifest unifies to one `modules` record keyed by category, holding arrays
(`cardinality: "one"` categories are kept to ≤ 1 record at install time). This
bumps `stanza.json`'s version to `0.2` — a clean break with no migration
(stanza is pre-1.0 and unpublished). Constraint-bearing is now emergent: the
resolver treats only `cardinality: "one"` categories as peers, so a multi-choice
category like `testing` can never accidentally become a peer. Install routing
lives in one `categoryHome` lookup shared by the CLI runner and the web preview.
