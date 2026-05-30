---
"@withstanza/schema": minor
"stanza-cli": patch
---

Extract the schema/contract layer into a standalone, npm-published `@withstanza/schema` package.

`@withstanza/schema` now owns the `stanza.json` manifest schema, the registry module/index schemas, the contract types, the canonical `CATEGORIES` taxonomy, and the package-manager + registry-config schemas — everything previously bundled into the private `@withstanza/registry`. It's published so third-party registry authors and editor tooling can validate against the exact same Zod source of truth the CLI uses; `StanzaManifestSchema` backs the JSON Schema served at <https://stanza.tools/schema.json>. A new private `@withstanza/utils` package holds the shared path-safety (`safeRelativePath`) and env-file (`appendEnvVar`) helpers.

No change to CLI behavior — this is an internal restructure. `@withstanza/registry` keeps only the resolver, install-field synthesis, and template rendering, depending on `@withstanza/schema`. The static registry build moves out of the registry package to the standalone `scripts/compile-registry.ts` (writing `index.json` + `modules/*.json` directly under its output dir, no `registry/` wrapper), and the manifest JSON Schema is served by the web app's `/schema.json` route rather than emitted as a build artifact.
