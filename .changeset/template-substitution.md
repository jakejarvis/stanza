---
"stanza-cli": minor
---

Promote template substitution into `@stanza/registry` and switch the syntax to dotted Mustache-style paths. `renderTemplate` and `buildRenderContext` (previously private to the CLI / `@stanza/codemods`) now live next to `synthesizeManifest` / `synthesizeEnvExample` / `synthesizePackageJsons`, joined by a new `synthesizeTemplates` that returns the fully-substituted file list for a resolved selection. The web builder's preview now calls the same code path the CLI does at apply time, so file previews stay byte-identical to what `stanza init` writes — fixes a regression where `{{dbPackageName}}` (and friends) showed up unsubstituted in the preview.

The template DSL itself moves to dotted paths: `{{project.name}}` (was `{{projectName}}`), `{{project.appDir}}` (was `{{appDir}}`), `{{package.name}}` (was `{{packageName}}`, the active module's own package), and `{{packages.<dir>.name}}` (was `{{<dir>PackageName}}`, e.g. `{{packages.db.name}}` for cross-package imports). Self-documenting, composes for future per-package fields (`{{packages.db.version}}`, `{{packages.db.path}}`) without inventing new flat keys, and aligns with how Mustache resolves nested contexts. Existing first-party modules (`auth-better-auth`, `auth-clerk`) migrated; third-party modules referencing the old flat keys will need a one-line rename.
