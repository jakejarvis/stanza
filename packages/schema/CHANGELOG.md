# @withstanza/schema

## 0.1.0

### Minor Changes

- [#16](https://github.com/jakejarvis/stanza/pull/16) [`ea2d8c4`](https://github.com/jakejarvis/stanza/commit/ea2d8c45bdde5df23005f4b739b7c5d029e9be2d) - Extract the schema/contract layer into a standalone, npm-published `@withstanza/schema` package.

  `@withstanza/schema` now owns the `stanza.json` manifest schema, the registry module/index schemas, the contract types, the canonical `CATEGORIES` taxonomy, and the package-manager + registry-config schemas — everything previously bundled into the private `@withstanza/registry`. It's published so third-party registry authors and editor tooling can validate against the exact same Zod source of truth the CLI uses; `StanzaManifestSchema` backs the JSON Schema served at <https://stanza.tools/schema.json>. A new private `@withstanza/utils` package holds the shared path-safety (`safeRelativePath`) and env-file (`appendEnvVar`) helpers.

  No change to CLI behavior — this is an internal restructure. `@withstanza/registry` keeps only the resolver, install-field synthesis, and template rendering, depending on `@withstanza/schema`. The static registry build moves out of the registry package to the standalone `scripts/compile-registry.ts` (writing `index.json` + `modules/*.json` directly under its output dir, no `registry/` wrapper), and the manifest JSON Schema is served by the web app's `/schema.json` route rather than emitted as a build artifact.

- [#18](https://github.com/jakejarvis/stanza/pull/18) [`04a196e`](https://github.com/jakejarvis/stanza/commit/04a196e4e9f3e4ea65445a191421f643d1fe3510) - Serve the first-party registry and manifest schema from Vercel Blob as the single origin.

  The registry index, per-module manifests, and the manifest JSON Schema are now hosted on Vercel Blob and served path-transparently from `stanza.tools` via rewrites: `stanza.tools/registry/index.json`, `stanza.tools/registry/<category>-<id>.json` (latest), `stanza.tools/registry/<category>-<id>@<version>.json` (immutable pin), and `stanza.tools/schema.json` / `schema@<version>.json`. The HTML browse pages (`/registry`, `/registry/<category>`, `/registry/<category>/<id>`) are unchanged. `DEFAULT_REGISTRY_URL` and `MANIFEST_SCHEMA_URL` keep their values, so the CLI and every manifest's `$schema` are unaffected.

  `@withstanza/schema` gains `compileManifestJsonSchema()` (the shared schema compiler) and `REGISTRY_BASE_URL` (`https://stanza.tools/registry`). `scripts/publish-registry.ts` compiles the registry and uploads it to Blob on every push to `main` that touches `registry/**` or the schema source — so a module change goes live without a release. Latest files overwrite each run; `@version` pins are written once and immutable. A `pull_request` CI guard (`scripts/check-module-versions.ts`) fails when a changed module's content differs from its published pin without a version bump.

  `compile-registry` now emits a flat layout (`<category>-<id>.json` + `index.json`, no `modules/` subdir) that maps 1:1 onto the Blob store, and a module's `package.json` version is the single source of truth (stamped into the compiled module; `module.ts`'s `version` field is no longer authoritative). The web app reads its own build-time compiled copy (`apps/web/.registry/`, gitignored) for prerendering and SSR; the schema is no longer served by an app route. No CLI behavior change — the read path for pinned versions is deferred to the upcoming `swap`/`update` verbs.
