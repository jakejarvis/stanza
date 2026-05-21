# Stanza

Shadcn-style CLI for assembling modular full-stack TS monorepos. Currently
ships `init`, `add`, `remove`, `list`, `search` against five slots:
`framework`, `styling`, `db`, `orm`, `auth`. `swap` + `update` verbs and
additional categories (api, ai, ui, payments, plus add-ons for testing,
tooling, deploy, email) are planned — the manifest already reserves the
fields they'll need (`modules[slot].version`, `regions`). See
[REGISTRY.md](REGISTRY.md) for the module roadmap and [TODO.md](TODO.md) for
active work.

Three things differentiate stanza from other scaffolders:

1. Post-init `stanza add` works on existing projects (manifest-driven, peer-aware).
2. Generated code is vendored verbatim — no `@stanza/runtime` dep.
3. Open registry spec — third parties can host their own static JSON.

## Layout

- `apps/cli/` — `@stanza/cli`, node entrypoint at `src/bin.ts` (run via tsx in dev, tsdown-built to `dist/bin.mjs` for publish)
- `apps/web/` — `@stanza/web`, TanStack Start visual builder (Vite-native, no Vinxi)
- `packages/registry/` — shared schema, slot/peer resolver, Zod manifest validator
- `packages/codemods/` — ts-morph helpers (idempotent + reversible)
- `packages/create-stanza/` — `pnpm create stanza` shim
- `scripts/` — repo-root maintainer helpers (not shipped): `registry-build.ts` emits static CDN JSON
- `registry/modules/<slot>-<id>/` — first-party modules: `module.ts` + `templates/` (modules don't ship codemod code; see Architecture rules)

In a **generated project**, `auth`, `db`, and `orm` modules install into their own internal workspace package at `packages/<dir>/` (named `@<manifest.name>/<dir>`); the app consumes them via `workspace:*` deps. `framework` and `styling` stay app-scoped because they wire the app shell itself. The mapping lives in the canonical [`SLOTS`](packages/registry/src/module.ts) array — `auth → "auth"`, both `db` and `orm → "db"` (they share a single `packages/db/` package). The `SLOT_PACKAGE_DIR` lookup and `slotLabel` helper are both derived from this array.

## Commands

- `pnpm --filter @stanza/cli dev -- <verb>` — run CLI directly via `tsx watch ./src/bin.ts`; no build step. Or `tsx apps/cli/src/bin.ts <verb>` for a one-shot run
- `pnpm --filter @stanza/cli build` — build the publishable CLI via tsdown (compiles to ESM JS at `apps/cli/dist/`, externalizes npm deps, inlines workspace packages). Same for `create-stanza`
- `pnpm registry:build` — regenerate `dist/registry/{index,modules/*}.json`. Uses bun for maintainer convenience (the script body is portable; `tsx scripts/registry-build.ts` works too)
- `pnpm --filter @stanza/web dev` — TanStack Start dev server. `prebuild` invokes [`apps/web/scripts/prepare-registry.sh`](apps/web/scripts/prepare-registry.sh) which copies the built `dist/registry/` into `apps/web/public/registry/`. Since `dist/registry/` is gitignored, the script builds it first when it's missing (e.g. on Vercel's clean checkout) — preferring `bun` locally and falling back to `pnpm exec tsx` on node-only deploy targets. The deployed site ships this directory as static assets, so CLI and web consume the same JSON. `public/registry/` is also registered as a Nitro `serverAssets` dir (vite.config.ts), so its contents are embedded into the server bundle at build time — SSR reads it via `useStorage("assets:registry")` (not the CDN), which is why it works on Vercel where `public/` is absent from the function fs
- `pnpm lint` / `pnpm lint:fix` — Oxlint across the whole repo (config: `.oxlintrc.json`)
- `pnpm fmt` / `pnpm fmt:check` — oxfmt across the whole repo (config: `.oxfmtrc.json`)
- `pnpm test` / `pnpm check-types` — fan out to every workspace via turbo
- `cd apps/web && node_modules/.bin/vite build` — generates `src/routeTree.gen.ts` (required before first typecheck)
- E2E smoke: seed `$TMPDIR/x` with `stanza.json` + `apps/web/package.json`, then `tsx apps/cli/src/bin.ts add <slot> <module>`
- `pnpm changeset` — create a new changeset describing what changed (run after a substantive PR)
- `pnpm release` — build CLI/create-stanza and publish to npm (only runs in CI; locally use `pnpm pack` to inspect tarballs)

## Toolchain invariants

- **Node-only at runtime.** The CLI source uses node APIs and is dev-run via `tsx`; the published binary is plain ESM JS (`#!/usr/bin/env node`). The only place bun appears is the shebang on root maintainer scripts (`scripts/*.ts`) for our own convenience — those scripts don't use any `Bun.*` APIs and run fine under tsx/node
- **Build pipeline**: `tsdown` compiles each publishable package to ESM JS in `dist/`. External npm deps are _not_ bundled (users install them via the normal dep chain); workspace deps are _inlined_ (we don't publish `@stanza/registry` and `@stanza/codemods` separately). Transitive runtime deps (`ts-morph`, `zod`) MUST be declared as direct `dependencies` of the publishable package or tsdown will inline them into the bundle
- **Per-workspace `dist/` paths**: `main`/`types` in the source `package.json` still point at `./src/` so other workspaces resolve `.ts` directly during dev. The published tarball overrides via `publishConfig` to point at `./dist/<x>.mjs`/`.d.mts`
- **Publishing**: only `@stanza/cli` and `create-stanza` ship to npm. `@stanza/codemods` + `@stanza/registry` are marked `private: true` (inlined into the CLI bundle by tsdown); `@stanza/web` is private (deployed as a Vercel site, not an npm package); the `registry/modules/*` packages are also private (they're registry data, not npm packages). Releases go through **Changesets**: drop a markdown file via `pnpm changeset`, push to main → the [release workflow](.github/workflows/release.yml) opens a "Version Packages" PR; merging that PR triggers the same workflow to run `pnpm release` (build CLI + create-stanza, then `changeset publish` to npm). Requires `NPM_TOKEN` in repo secrets; provenance attestations are emitted via `id-token: write` + `NPM_CONFIG_PROVENANCE=true`
- pnpm 10 + `node-linker: isolated` — each workspace MUST declare `@types/node` in its own devDeps and set `types: ["node"]` in tsconfig (auto-discovery doesn't reach into the isolated `node_modules/@types`)
- TypeScript 6 — `allowImportingTsExtensions: true` + `noEmit: true` is set in `tsconfig.json`; the CLI/create-stanza emit JS via tsdown, the registry/codemods packages stay source-only and never emit
- `tsconfig.json` excludes `**/templates/**` globally — template files target user projects, not this repo
- Zod 4: use `z.partialRecord(K, V)` for finite-key partial records (`z.record(z.enum, V)` requires exhaustive keys)
- TanStack Start: `verbatimModuleSyntax: false` in `apps/web/tsconfig.json` (server bundles leak otherwise); `tanstackStart()` MUST precede `react()` in vite plugins

## Architecture rules

- **Modules are vendored**: their templates land in the user's repo verbatim; no `@stanza/runtime` dep
- **Template distribution**: `scripts/registry-build.ts` inlines each template file's contents into the per-module JSON's `templates[].content` field so HTTP-loaded manifests are self-contained. The runner prefers `tpl.content` and only reads from `registry/modules/<x>/templates/` when it's absent (local dev). New templates need no build wiring — they're picked up automatically
- **Module logos**: drop `logo.svg` (theme-agnostic) or `logo-light.svg` + `logo-dark.svg` (theme pair) in a module's directory. The registry build auto-detects and inlines as `mod.logo` (string or `{ light, dark }`) — module authors don't declare anything in `module.ts`. First-party logos come from [svgl.app](https://svgl.app). The web builder renders inline via `dangerouslySetInnerHTML`
- **Registry is data; CLI is the runtime**: the per-module JSON ships templates (text), deps (strings), env (strings), scripts (strings), logos (SVG markup), and codemod **invocations** (`{ id, args }`). It does NOT ship codemod _code_. The catalog of generic codemods lives in [packages/codemods/src/builtins/](packages/codemods/src/builtins/) and is exposed via the `@stanza/codemods/builtins` subpath export — each codemod is parameterized by `TArgs` and reusable across modules (`wrap-root-layout` serves both Clerk and any future provider-style auth/state library). The catalog is statically imported into the CLI binary at build time, so distribution shape (single binary, pnpm-isolated, npm-hoisted, `npx`, `bun --compile`) doesn't matter — implementations always travel with the runtime
- **Adding a generic codemod**: drop `<id>.ts` under [packages/codemods/src/builtins/](packages/codemods/src/builtins/), default-export a `Codemod<TArgs>`, and register it in [packages/codemods/src/builtins/index.ts](packages/codemods/src/builtins/index.ts). Codemods that bake in module-specific identifiers don't belong — factor them into args
- **Third-party codemods**: deferred. Third-party HTTP-loaded modules can use the existing catalog codemods (pass `{ id, args }` from their manifest) but can't add new ones until we land a proper sandboxed-execution + signing model
- **apps/web previews are server-rendered**: Shiki runs in `apps/web/src/server/highlighter.ts` (module-singleton, kept warm). The builder loader (`createServerFn` in `apps/web/src/server/builder-state.ts`) computes selected files from URL search params, pre-renders Shiki HTML for each, and ships `Record<path, { light, dark }>` to the client. `shiki` must NEVER be imported from a client component — verified by `vite build` followed by `grep shiki .output/public/assets/*.js` (should return nothing)
- **Slot taxonomy** is currently `framework | styling | db | orm | auth`. Adding a slot is now a **two-line edit**: append the id to `KNOWN_SLOTS` (the `as const` tuple Zod needs for literal inference) and append a `Slot` entry to `SLOTS` with `{ id, label, description, packageDir }`. Decide upfront whether the new slot extracts (data layer, observability) or wires the app shell (router, global CSS) and set `packageDir` accordingly
- **Slots vs. add-ons**: the 5 slots are _one-choice, peer-constraint-bearing_. **Add-ons** are _multi-choice, no outbound peer constraints_ (`testing`, `tooling`, `deploy`, `email`, `monorepo`) — several coexist in a category. The add-on schema is **live** (landed with the `testing` modules): a `Module` is a discriminated union on `kind` (`"slot"` default, carrying `slot`; or `"addon"`, carrying `category`); `isAddon()` narrows it and `moduleGroup()` returns the slot-or-category key. Add-on categories live in `KNOWN_ADDONS`/`ADDON_CATEGORIES` (parallel to `KNOWN_SLOTS`/`SLOTS`), **deliberately disjoint from `KNOWN_SLOTS`** so the resolver — which iterates `KNOWN_SLOTS` for peer checks and `activePeerIds` — never lets add-ons participate in others' dispatch. An add-on _can_ declare a one-way `peers` (e.g. `{ framework: [...] }`) and framework-varying adapters; `resolveAdapter` handles it unchanged. The manifest stores them in `addons: Partial<Record<AddonCategoryId, StanzaAddonRecord[]>>` (`.default({})` keeps old `stanza.json` valid). Region ownership keys on `module.id`, so two add-ons writing the same file at disjoint dot-paths (vitest `scripts.test` vs playwright `scripts.test:e2e`) never conflict. Future single-choice categories (`api`, `ai`, `ui`, `payments`) are still slots, added via `KNOWN_SLOTS`/`SLOTS`
- **Adapter keys** encode peer choices (e.g., `next+drizzle`); the resolver picks the most specific match
- **Module-level install fields**: `dependencies`, `devDependencies`, `env`, `scripts`, and `consumesPackages` are declared at the module level when shared across adapters. Adapter-level fields override per-key (`env` merges by `name`). This avoids re-declaring the same `dependencies` and `env` block in every adapter of a multi-framework module (cf. Better Auth — 6 adapters, but `better-auth` dep and the two env vars are declared once)
- **Slot-package extraction**: `auth`/`db`/`orm` modules install into `packages/<dir>/` workspace packages (named `@<manifest.name>/<dir>`); templates `scope: "package"`, deps/devDeps/scripts route there, and the app gets a `workspace:*` dep wired by the runner. `framework`/`styling` stay app-scoped (their `packageDir` entry is `null`). The bootstrap files (the package's `package.json` + `tsconfig.json` and the host app's workspace dep) are **system-owned** — not tracked in `regions`. `stanza remove`'s sweep deletes them when no claims remain under `packages/<dir>/`
- **Generated projects don't share a tsconfig base**: every `apps/*/tsconfig.json` and `packages/*/tsconfig.json` is self-contained. The framework module ships the app's tsconfig; the runner's `ensureSlotPackage` writes a matching self-contained config when bootstrapping a slot package. `tsconfig.json` lives in the stanza repo only; do not emit it in generated trees
- **Cross-package wiring**: when a module's source code imports from another internal package (e.g. `better-auth`'s `auth.ts` reads `db` from the orm package), declare `consumesPackages: ["db"]` at the module level. The runner adds `@<project>/db: workspace:*` to this module's own package. Module-level (not adapter-level) because the source code is shared infrastructure — adapters vary in templates/codemods, not in what they import. Templates can reference other packages via `{{<dir>PackageName}}` substitution (e.g. `{{dbPackageName}}` → `@my-app/db`) — substitution runs over both template bodies (when `template: true`) and codemod-invocation `args` string values
- **Region ownership** in `stanza.json` is the source of truth for `stanza remove`. Two modules claiming the same region is a hard error (`RegionConflictError`). Note: regions are _not yet sufficient for `swap`_ — that verb additionally needs old-adapter-region → new-adapter-region mapping; design pending
- **Codemod catalog ids are part of the public contract**: once stanza is published, renaming a builtin codemod id breaks every third-party manifest that references it. Treat ids as you would npm package names — additions are free, renames require a deprecation cycle, removals require a manifest schema version bump
- **Module `version` field**: every module manifest declares a `version` string, pinned into `stanza.json` at install time. The upcoming `swap`/`update` verbs read it; today it's stored for forward compatibility. Bump it on schema-affecting changes (template additions, dep upgrades) per semver
- **Declarative beats imperative**: prefer `templates`/`dependencies`/`env`/`scripts` over imperative codemods; the runner applies declarative fields generically
- **Reserved manifest fields**: `modules[slot].version` and `regions` are written today but only fully consumed by the upcoming `swap`/`update` verbs — do not drop them
- **Web app hosts the canonical registry**: `pnpm --filter @stanza/web build` runs `prebuild` which builds the registry (if missing) and copies it into `apps/web/public/registry/`. The deployed Vercel output therefore ships `index.json` + `modules/*.json` at the same origin. The published CLI's `DEFAULT_REGISTRY_URL` points at this same URL, so users get a working CLI with zero configuration. Self-hosters and CI override via `STANZA_REGISTRY` (URL or filesystem path)

## Module authoring

- `module.ts` exports `defineModule({...})` with at least one adapter (use `match: {}` for "default / no peer"). Slot modules carry `slot`; **add-on modules** set `kind: "addon"` + `category` (one of `KNOWN_ADDONS`) and live in `registry/modules/<category>-<id>/` (e.g. `testing-vitest/`). Add-ons are app/repo-scoped (no `packageDir`); give co-existing add-ons in a category disjoint `scripts`/file paths so their region claims don't collide
- Templates go in `templates/`, referenced by `src` path. `scope` decides where `dest` lands:
  - `"app"` (default) → `manifest.appDir` (e.g. `apps/web/`)
  - `"repo"` → repo root
  - `"package"` → `packages/<packageDir>/` where `packageDir` is the active module's slot entry in `SLOTS` — only valid for slots with a non-null entry (`auth`, `db`, `orm`)
- For `auth`/`db`/`orm` modules, default to `scope: "package"` for everything that can live inside the package boundary. Reach for `scope: "app"` only when a framework convention forces the file to sit at the app root (e.g. Next's `middleware.ts`, App Router API routes). App-scoped files should be thin shims that `import` from `{{packageName}}`; set `template: true` and the runner runs mustache substitution
- For cross-package imports (e.g. `auth` reading `db`), declare `consumesPackages: ["<dir>"]` **at the module level** (not on each adapter). The runner adds the workspace dep on first apply. Write the import as `{{<dir>PackageName}}` (e.g. `import { db } from "{{dbPackageName}}";`)
- **Hoist shared install fields** (`dependencies`, `devDependencies`, `env`, `scripts`) to the module level when they don't vary across adapters. Adapter-level values still work for true variations and override per-key. Example: Better Auth's `dependencies: { "better-auth": "^1.6.11" }` and the two env vars are declared once at module level; only the per-(framework, orm) templates and codemods sit in the adapter blocks
- Framework modules MUST NOT ship a `package.json.tpl` — it collides with `addPackageDependency`. Let the runner merge deps into the host's package.json. The same rule applies to **package-scoped** modules: don't ship a `packages/<dir>/package.json` template — the runner's `ensureSlotPackage` bootstraps one and merges deps in
- To invoke an imperative codemod from a module, add `codemods: [{ id: "<catalog-id>", args: {...} }]` to the adapter. Modules never ship code — if no catalog entry matches the need, design a new generic codemod with the right args. String values in `args` go through mustache substitution (same context as template bodies)
- For codemods that operate on files inside a slot's package (e.g. extending the orm's schema barrel from the auth module), pass `base: "package:<dir>"` to the catalog codemod — `re-export` and `append-to-file` both honor it

## Gotchas

- Clack spinners (`p.spinner()`) don't auto-stop on promise rejection — wrap awaits in try/catch and call `spinner.stop(...failed)` in the catch
- LSP diagnostics on template files (e.g. "Cannot find module 'react'") are noise; the global exclude works for `tsc` but tsserver still indexes them
- The dev registry is found by walking up from `import.meta.url` looking for `registry/modules/`; `STANZA_REGISTRY` env var overrides (FS path or HTTP URL)
- `pnpm install` says "Already up to date" when only workspace `package.json` files changed without lockfile-affecting bumps — use `pnpm install --force` to re-link
- Oxlint has _most_ but not all ESLint plugin rules — `prevent-abbreviations`, `react/jsx-uses-react`, etc. don't exist. Check `node_modules/oxlint/configuration_schema.json` if a rule name fails
- oxfmt auto-loads `.gitignore` and `.prettierignore`; we use `.oxfmtrc.json`'s `ignorePatterns` instead so we don't masquerade as a Prettier project
