---
"@withstanza/schema": minor
"stanza-cli": patch
---

Serve the first-party registry and manifest schema from Vercel Blob as the single origin.

The registry index, per-module manifests, and the manifest JSON Schema are now hosted on Vercel Blob and served path-transparently from `stanza.tools` via rewrites: `stanza.tools/registry/index.json`, `stanza.tools/registry/<category>-<id>.json` (latest), `stanza.tools/registry/<category>-<id>@<version>.json` (immutable pin), and `stanza.tools/schema.json` / `schema@<version>.json`. The HTML browse pages (`/registry`, `/registry/<category>`, `/registry/<category>/<id>`) are unchanged. `DEFAULT_REGISTRY_URL` and `MANIFEST_SCHEMA_URL` keep their values, so the CLI and every manifest's `$schema` are unaffected.

`@withstanza/schema` gains `compileManifestJsonSchema()` (the shared schema compiler) and `REGISTRY_BASE_URL` (`https://stanza.tools/registry`). `scripts/publish-registry.ts` compiles the registry and uploads it to Blob on every push to `main` that touches `registry/**` or the schema source — so a module change goes live without a release. Latest files overwrite each run; `@version` pins are written once and immutable. A `pull_request` CI guard (`scripts/check-module-versions.ts`) fails when a changed module's content differs from its published pin without a version bump.

`compile-registry` now emits a flat layout (`<category>-<id>.json` + `index.json`, no `modules/` subdir) that maps 1:1 onto the Blob store, and a module's `package.json` version is the single source of truth (stamped into the compiled module; `module.ts`'s `version` field is no longer authoritative). The web app reads its own build-time compiled copy (`apps/web/.registry/`, gitignored) for prerendering and SSR; the schema is no longer served by an app route. No CLI behavior change — the read path for pinned versions is deferred to the upcoming `swap`/`update` verbs.
