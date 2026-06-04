# Stanza Agent Guide

Stanza is a shadcn-style CLI for assembling modular full-stack TypeScript monorepos. It has two core product constraints that should shape every change:

- Generated code is vendored into the user's repo. Do not introduce a `@stanza/runtime` dependency or any hidden runtime contract.
- `stanza add` must work against an existing Stanza project, not only during `init`. Treat additions and removals as reversible edits to user-owned code.

Current CLI verbs are `init`, `add`, `remove`, `list`, `search`, and `doctor`. `swap` and `update` are planned; the manifest already preserves `modules[category][].version` and `regions` for them.

## Start Here

- Read the local source before making architectural assumptions. The schemas in `packages/schema/src/` are the public contract; module manifests and CLI behavior should derive from them.
- Prefer focused changes. The registry, schema, codemods, CLI runner, and web preview share contracts; update every affected boundary together.
- Validate with the Vite+ toolchain. This repo is not a Turbo/Vite/Vitest standalone setup.
- Keep template output realistic. Files under `registry/modules/*/templates/` target generated user projects, not this repo's toolchain.
- Update `skills/stanza-cli/SKILL.md` whenever the public CLI contract changes. Agents using that skill may not have access to this source repo.

## Repository Map

| Path                                | Role                                                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/cli/`                         | `stanza-cli`; binary entry is `src/bin.ts`; publishable ESM built by tsdown through `vp pack`.                                                                 |
| `apps/web/`                         | `@withstanza/web`; TanStack Start visual builder and docs site; private, deployed to Vercel.                                                                   |
| `packages/schema/`                  | `@withstanza/schema`; Zod source of truth for `stanza.json`, module manifests, registry config, package managers, and categories. Publishes the JSON Schema.   |
| `packages/registry/`                | Resolver and synthesis layer: adapter selection, package/env/script/README/template rendering, package JSON previews. Private and inlined into the CLI bundle. |
| `packages/codemods/`                | Generic ts-morph codemod catalog. Codemods must be idempotent and reversible where removal depends on them.                                                    |
| `packages/utils/`                   | Shared path-safety and env-file helpers such as `safeRelativePath` and `appendEnvVar`.                                                                         |
| `packages/create-stanza/`           | `pnpm create stanza` / create-package shim; publishable.                                                                                                       |
| `registry/modules/<category>-<id>/` | First-party registry modules. Each module is data: `package.json`, `module.ts`, optional logos/readme, and templates.                                          |
| `scripts/compile-registry.ts`       | Standalone static registry compiler. Emits flat JSON registry files and exports `compileRegistry()`.                                                           |
| `scripts/publish-registry.ts`       | Publishes registry and manifest schema JSON to Vercel Blob.                                                                                                    |
| `skills/stanza-cli/SKILL.md`        | Source-repo-independent agent instructions for the published CLI.                                                                                              |

## Toolchain

The repo runs on Vite+ (`vp`). Configuration lives in the root `vite.config.ts` and package-level Vite+ config where needed. Do not add `turbo.json`, `.oxlintrc.json`, `.oxfmtrc.json`, or per-package `vitest.config.ts`.

Repo source should import from `vite-plus` and `vite-plus/test`. Template files under `registry/modules/*/templates/` should keep using stock `vite` and `vitest` imports because they are copied into user projects.

Common commands:

```sh
vpx jiti apps/cli/src/bin.ts <verb>
vp check
vp check --fix
vp test
vp run -r build
vp run @withstanza/web#dev
vp run @withstanza/web#build
pnpm changeset
```

Command notes:

- Use `vpx jiti apps/cli/src/bin.ts <verb>` for CLI development; no build step is required.
- Use `vp check` for validation loops. It runs format, lint, type checking, and type-aware `tsgolint`.
- Use `vp test` for Vitest 4 through `vite-plus/test`; project selection comes from root `vite.config.ts`.
- `vp run -r build` runs package builds through `vp pack` and tsdown.
- The web app's `dev` and `build` scripts first run its `compile-registry` Vite+ task, which writes `apps/web/.registry/{index.json,<slug>.json}`.
- `src/routeTree.gen.ts` is generated by the web build. If it is missing, run `vp run @withstanza/web#build` before the first `vp check`.
- Add a changeset after substantive publishable changes. `stanza-cli`, `create-stanza`, and `@withstanza/schema` publish to npm; other workspaces are private.

For web automation, use `agent-browser --help` and prefer `agent-browser` over built-in browser tooling unless the immediate environment requires otherwise.

## Runtime And Packaging Invariants

- Runtime is Node only. The CLI is published as plain ESM JavaScript with a `#!/usr/bin/env node` binary. Bun shebangs in `scripts/*.ts` are convenience only; do not use `Bun.*` APIs.
- Root package manager is pnpm. The current root `packageManager` field is the source of truth for the exact version.
- The build pipeline is `vp pack` -> tsdown -> ESM `dist/`.
- Source `main` and `types` point at `./src/` for workspace development. `publishConfig` overrides tarball entrypoints.
- External npm dependencies are not bundled. Workspace dependencies are inlined into publishable packages, so transitive runtime packages such as `zod` and `ts-morph` must be direct `dependencies` of any publishable package that needs them.
- The workspace uses isolated pnpm linking. Every workspace package needs its own `@types/node` dev dependency and `types: ["node"]` in its tsconfig when it uses Node globals or APIs.
- TypeScript is configured for `allowImportingTsExtensions: true` and `noEmit: true`. The repo tsconfig excludes `**/templates/**`; templates have their own target environment after generation.
- Zod 4 finite-key partial maps should use `z.partialRecord(K, V)`.
- TanStack Start must run before React in Vite plugins. In `apps/web`, keep `tanstackStart()` before `react()` and keep `verbatimModuleSyntax: false` in its tsconfig.

## Core Architecture

Stanza has three layers:

1. Schema: `@withstanza/schema` defines the manifest, registry, category, and module contracts.
2. Registry data: module JSON describes templates, deps, env vars, scripts, logos, README text, and codemod invocations.
3. CLI runtime: the runner resolves adapters, renders templates, applies codemods, writes manifests, tracks regions, and performs rollback/removal.

Important boundaries:

- Registry JSON must never ship executable codemod code. It may only reference codemods by `{ id, args }`.
- Generic codemod implementations live in `packages/codemods/src/builtins/` and are statically imported into the CLI bundle.
- `renderTemplate` lives in `@withstanza/registry` so CLI apply and web preview render byte-identical output.
- `safeRelativePath` and related path guards are part of the safety boundary. Do not replace them with ad hoc string checks.
- Generated projects should not share a root tsconfig base. Emit self-contained `apps/*/tsconfig.json` and `packages/*/tsconfig.json` files; the Stanza repo root tsconfig is only for this repo.

## Categories And Install Homes

The canonical category list is `CATEGORIES` in `packages/schema/src/category.ts`. Add or change categories there first.

Each category has:

- `cardinality`: `"one"` or `"many"`
- `home`: `"app"`, `"repo"`, or `"package"` with a package dir

Derived helpers include `KNOWN_CATEGORIES`, `PEER_CATEGORIES`, `PACKAGE_DIRS`, `categoryHome()`, `categoryLabel()`, and `categoryCardinality()`. Do not maintain hand-written duplicate lists.

Ordering matters. `CATEGORIES` is topological: a category appears after everything it can peer on, and `many` categories are leaves.

Peer-resolution rules:

- Only `cardinality: "one"` categories are peer candidates.
- The resolver iterates `PEER_CATEGORIES`.
- A `many` category never dispatches other modules.

Install routing:

- `home: "app"` writes to targeted app dirs.
- `home: "repo"` writes root config, root scripts, and root files.
- `home: "package"` writes `packages/<dir>/`, names it `@<manifest.name>/<dir>`, bootstraps the package through the runner, and adds `workspace:*` dependencies from consuming apps.

`categoryHome(id)` is the single decision point for CLI apply/remove and web package JSON synthesis.

## Manifest Rules

`StanzaManifestSchema` is the single source of truth for `stanza.json`.

Selections live in:

```ts
modules: Partial<Record<CategoryId, StanzaModuleRecord[]>>;
```

Every module record stores at least `id`, `version`, and `adapter`. It may also store `apps`, `namespace`, `codemods`, and `consumesPackages`.

`apps` semantics:

- Required for `home: "app"` module records.
- Optional for `home: "package"` records. Omitted means app-scoped shims apply to every app; an explicit list restricts shim targets.
- Forbidden for `home: "repo"` records.

Cardinality enforcement:

- For `home: "app"` single-choice categories, cardinality is per app.
- For `home: "repo"` and `home: "package"` single-choice categories, cardinality is per project.
- `selectedOne(manifest, category, appId)` is the app-aware read helper.

Reserved and runner-managed fields:

- Preserve `modules[category][].version`; `swap` and `update` will consume it.
- Preserve `regions`; remove and future update flows rely on ownership data.
- Preserve `readmeChecksum`; it protects user-edited README files from automatic overwrites.
- `registries`, `apps`, and `packageManager` are user configuration, but schema validation still applies.

The app `id` doubles as the workspace package suffix:

- `id: "web"` -> `@<project>/web`
- This is true regardless of the app's `dir`.

## Regions And Removal

Region ownership in `stanza.json` is the source of truth for `stanza remove`. Two modules claiming the same region should throw `RegionConflictError`.

Region keys are per-file dot paths owned by module id. Disjoint paths can coexist, for example `scripts.test` and `scripts.test:e2e`.

Package bootstrap files are system-owned, not region-owned:

- generated `package.json`
- generated `tsconfig.json`
- workspace dependency edges created for slot packages

`stanza remove` sweeps package dirs derived from `PACKAGE_DIRS` when no claims remain. Do not add per-module region ownership for bootstrap files just to make removal work.

Regions are not enough for `swap` yet. That verb needs adapter-region remapping; do not imply it is already designed.

## Registry Build And Serving

`scripts/compile-registry.ts` compiles first-party modules into a flat registry:

```txt
<out>/index.json
<out>/<category>-<id>.json
```

There is no `modules/` subdirectory in compiled output. The CLI reads a registry main file from a full URL or filesystem path. The index carries each module's relative `path`; loaders must resolve that path relative to the index file rather than infer filenames.

Compilation behavior:

- Imports `registry/modules/*/module.ts`.
- Reads each module's `package.json` version as the module version source of truth.
- Inlines template file contents into `templates[].content`.
- Inlines optional `readme.md`.
- Optimizes and inlines `logo.svg` or `logo-light.svg` plus `logo-dark.svg`.
- Writes lightweight metadata to `index.json` and full module JSON to each module file.

Runner behavior:

- Prefer `tpl.content` when present.
- Fall back to local `templates/` files only when content is absent in local dev/test contexts.
- New templates do not need extra build wiring.

Public serving:

- Vercel Blob is the canonical registry and schema origin.
- `DEFAULT_REGISTRY_URL` is `https://stanza.tools/registry/index.json`.
- `MANIFEST_SCHEMA_URL` is `https://stanza.tools/schema.json`.
- `REGISTRY_BASE_URL` in `@withstanza/schema` is the branded registry base.
- `scripts/publish-registry.ts` uploads:
  - `registry/index.json`
  - `registry/<slug>.json`
  - `registry/<slug>@<version>.json`
  - `schema.json`
  - `schema@<version>.json`

Vercel routing:

- `apps/web/vite.config.ts` uses legacy `routes`, not `rewrites`, for `schema*.json` and `registry/*.json`.
- These routes must stay scoped to `.json` so HTML pages such as `/registry`, `/registry/<cat>`, and `/registry/<cat>/<id>` fall through to TanStack Start.
- Keep matching `.json` files out of `public/`; `routes` would shadow them.
- Blob must be seeded before these routes go live because `index.json` and `schema.json` have no static fallback.

The web app does not fetch the public registry during SSR. It reads the build-time compiled copy at `apps/web/.registry/` through Nitro server assets and `useStorage("assets:registry")`.

`STANZA_REGISTRY=<url-or-path>` overrides the first-party registry source for the CLI. It must point to a registry main file, not a directory.

## Third-Party Registries

Third-party registry namespaces are declared under `stanza.json#registries`. Modules are addressed as:

```txt
<category> @<namespace>/<id>
```

Rules:

- `@stanza` is reserved and cannot be redeclared in `registries`.
- Unknown namespaces fail fast.
- `STANZA_REGISTRY` only overrides the first-party source; it does not enable third-party modules.
- Registry config can include headers and params with environment-variable expansion.
- Telemetry redacts non-`@stanza` module ids to `<redacted>`, but stderr still prints full ids; CI log forwarders may see them.

Third-party codemod implementations are intentionally deferred until a sandboxing and signing model exists. Third-party modules may invoke existing catalog codemod ids but may not ship new codemod code.

## Module Authoring Checklist

Modules live at `registry/modules/<category>-<id>/`.

A normal module directory contains:

```txt
package.json
module.ts
templates/
readme.md          # optional
logo.svg           # optional
logo-light.svg     # optional, pair with logo-dark.svg
logo-dark.svg      # optional, pair with logo-light.svg
```

Authoring rules:

- `module.ts` default-exports `defineModule({...})`.
- Each module belongs to exactly one category.
- Each module has one or more adapters.
- Use `match: {}` for the default/no-peer adapter.
- Adapter `match` keys encode peer choices; the resolver picks the most specific matching adapter.
- A module can declare one-way `peers`, such as `{ framework: [...] }`, and can have framework-varying adapters regardless of its own category cardinality.
- For `many` categories, make scripts, files, env vars, and regions disjoint so modules can coexist.
- Declare `consumesPackages: ["<dir>"]` at module level when source imports another internal package. Do not hide cross-package imports in an adapter.
- Reference internal packages in templates and codemod args with `{{packages.<dir>.name}}`, for example `{{packages.db.name}}`.
- Full template context is `{ project, app, package, packages }`.
- `app.*` is rebound per target app in the apply loop.
- Hoist shared `dependencies`, `devDependencies`, `env`, `scripts`, and `consumesPackages` to module level. Adapter-level fields merge over them per key; `env` merges by `name`.
- Every module package needs a semver `version` in its `package.json`. Bump it when templates, dependencies, env, scripts, README output, or schema-relevant behavior changes.

Template `scope`:

- Omitted or `"app"` resolves `dest` inside each targeted app dir.
- `"repo"` resolves `dest` at repo root.
- `"package"` resolves `dest` inside `packages/<dir>/` for package-home categories only.

For package-home modules, default to `scope: "package"` for package-owned source. Use app-scoped templates only for thin framework shims that must live in the consuming app, such as a Next route/proxy file. App shims should import from `{{package.name}}` and usually use `template: true`.

Do not ship these templates:

- `package.json`
- `tsconfig.json`
- framework module `package.json.tpl`
- package-home `packages/<dir>/package.json`

The runner owns package bootstrap through helpers such as `ensureSlotPackage` and dependency synthesis. Shipping bootstrap templates causes collisions and breaks removal.

Logo rules:

- Use `logo.svg` for a theme-agnostic mark, or `logo-light.svg` and `logo-dark.svg` for a theme pair.
- First-party logos can usually be pulled from <https://api.svgl.app>.
- The registry compiler optimizes, namespaces, and inlines SVG markup.

README rules:

- Put module README contribution in sidecar `readme.md`.
- The compiler inlines it; module authors should not set `readme` directly in `module.ts`.
- README content renders with the same template context as templates.

## Codemod Rules

Codemod catalog ids are public API. Once published, renaming an id breaks third-party manifests and existing installed records.

To add a generic codemod:

1. Add `packages/codemods/src/builtins/<id>.ts`.
2. Default-export a `Codemod<TArgs>`.
3. Add focused tests beside it.
4. Register it in `packages/codemods/src/builtins/index.ts`.
5. Invoke it from modules as `codemods: [{ id, args }]`.

Rules:

- Codemods must be generic and parameterized by args. Module-specific ids do not belong in the catalog.
- String values in codemod `args` are template-rendered with the same context as files.
- For codemods operating inside a package slot, pass `base: "package:<dir>"` where supported, for example by `re-export` and `append-to-file`.
- Additions are free. Renames need a deprecation cycle. Removals need a manifest schema version bump and migration plan.
- Keep apply and revert behavior aligned with region ownership and `remove`.

## CLI Behavior To Preserve

Mutation safety:

- Mutating commands refuse dirty git worktrees unless the user explicitly opts into the dangerous dirty-worktree flag.
- `add` uses a file transaction and should roll back on failure.
- `remove` should use installed manifest snapshots where needed so it can work even after the upstream registry changes.
- `doctor` is read-only and should exit non-zero on drift.

Dependency resolution:

- `init` and `add` may refresh compatible npm ranges unless disabled by env.
- Keep `STANZA_NO_NPM_LOOKUP` and `STANZA_NPM_REGISTRY` behavior intact.
- Workspace dependencies between generated packages should use `workspace:*`.

Telemetry:

- Honor `--no-telemetry`, `STANZA_TELEMETRY=0`, `DO_NOT_TRACK=1`, and CI auto-disable.
- Do not persist identifiers.
- Redact third-party module ids in telemetry.

When changing public flags, command names, manifest fields, registry config, module addressing, telemetry behavior, or error semantics, update:

- CLI implementation and tests
- `packages/schema` types/schemas if contract-shaped
- docs in `apps/web/content/docs/`
- `skills/stanza-cli/SKILL.md`

## Web App Rules

The web app is a TanStack Start application with SSR/RSC enabled through its Vite config.

Registry data:

- Web dev/build runs `vp run compile-registry` first.
- Compiled registry data lives in `apps/web/.registry/` and is gitignored.
- Nitro serves that folder as server assets.
- SSR reads registry data through `apps/web/src/server/registry-base.server.ts` and `useStorage("assets:registry")`.
- Do not fetch `https://stanza.tools/registry/index.json` from production SSR; production loopback to the public site is intentionally avoided.

Syntax highlighting:

- Shiki must stay server-side.
- `apps/web/src/server/highlighter.server.ts` may import Shiki.
- `apps/web/src/server/highlighter.ts` contains client-safe preview types.
- Never import `shiki`, `createHighlighter`, `codeToHtml`, or WASM-loading Shiki runtime from client components.
- After `vp run @withstanza/web#build`, inspect `.output/public/assets/*.js` for `createHighlighter`, `codeToHtml`, or `loadWasm`. They should be absent. A plain `grep shiki` can produce false positives from static MDX code-block classes and CSS vars.

Vite plugin order:

- Keep `tanstackStart()` before `react()`.
- Keep the Vercel Blob JSON route rules in Nitro/Vercel config scoped to JSON.

## Release And Publishing

The release workflow has two independent jobs on pushes to `main`.

NPM job:

- Installs with `voidzero-dev/setup-vp`.
- Builds, checks, and tests.
- Uses Changesets to create a release PR or publish.
- Publishes `stanza-cli`, `create-stanza`, and `@withstanza/schema`.

Registry job:

- Detects changes under `registry/modules/`, `packages/schema/`, or `scripts/`.
- Runs `vpx jiti scripts/publish-registry.ts` when needed.
- Uploads latest registry/schema JSON plus immutable version pins to Vercel Blob.
- Is decoupled from npm releases so module changes can go live on merge.

If a registry change modifies an already-published module version, bump that module's package version. Immutable Blob pins are expected not to drift.

## Validation Recipes

Default validation:

```sh
vp check
vp test
```

Build everything:

```sh
vp run -r build
```

Run the CLI from source:

```sh
vpx jiti apps/cli/src/bin.ts --help
vpx jiti apps/cli/src/bin.ts search
```

Smoke-test `stanza add` against a compiled local registry:

```sh
vpx jiti scripts/compile-registry.ts "$TMPDIR/stanza-reg"
mkdir -p "$TMPDIR/stanza-smoke/apps/web"
# Seed a minimal stanza.json and apps/web/package.json appropriate for the module under test.
STANZA_REGISTRY="$TMPDIR/stanza-reg/index.json" \
  vpx jiti apps/cli/src/bin.ts add <category> <module>
```

Important details:

- `STANZA_REGISTRY` points at the full `index.json` path, not the registry dir.
- Compiled registry output is flat under the out dir.
- The CLI has no source-tree registry loader when `STANZA_REGISTRY` is unset; it hits the production registry.

Web build checks:

```sh
vp run @withstanza/web#build
rg "createHighlighter|codeToHtml|loadWasm" apps/web/.output/public/assets
```

The `rg` command above should not find Shiki runtime code in client assets.

## Quick Do / Do Not

Do:

- Derive category behavior from `CATEGORIES`.
- Keep registry modules as data.
- Keep codemods generic and cataloged.
- Preserve manifest `version`, `regions`, `readmeChecksum`, module `namespace`, and module version pins.
- Use structured parsers/helpers for JSON, JSONC, tsconfig, package JSON, env, and TypeScript edits.
- Keep generated project files self-contained.
- Validate with `vp check` and focused tests.

Do not:

- Add a Stanza runtime package to generated projects.
- Add standalone Vite/Vitest config or dependencies to this repo.
- Import Shiki in client code.
- Ship package bootstrap files as module templates.
- Make a `many` category participate in peer dispatch.
- Infer compiled registry filenames instead of reading `path` from the index.
- Rename or remove published codemod ids casually.
- Drop reserved manifest fields because the current verb does not consume them.
