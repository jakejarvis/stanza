# Stanza

Shadcn-style CLI for assembling modular full-stack TS monorepos. Currently
ships `init`, `add`, `remove`, `list`, `search` against five slots:
`framework`, `styling`, `db`, `orm`, `auth`. `swap` + `update` verbs and
additional slots (api/ai/ui/payments/email/tooling/testing/deploy) are
planned — the manifest already reserves the fields they'll need
(`modules[slot].version`, `regions`). See [REGISTRY.md](REGISTRY.md) for the
module roadmap and [TODO.md](TODO.md) for active work.

Three things differentiate stanza from other scaffolders:

1. Post-init `stanza add` works on existing projects (manifest-driven, peer-aware).
2. Generated code is vendored verbatim — no `@stanza/runtime` dep.
3. Open registry spec — third parties can host their own static JSON.

## Layout

- `apps/cli/` — `@stanza/cli`, Bun entrypoint at `src/bin.ts`
- `apps/web/` — `@stanza/web`, TanStack Start visual builder (Vite-native, no Vinxi)
- `packages/registry/` — shared schema, slot/peer resolver, Zod manifest validator
- `packages/codemods/` — ts-morph helpers (idempotent + reversible)
- `packages/create-stanza/` — `pnpm create stanza` shim
- `scripts/` — repo-root maintainer helpers (not shipped): `registry-build.ts` emits static CDN JSON, `module-new.ts` scaffolds a new module
- `registry/modules/<slot>-<id>/` — first-party modules: `module.ts` + `templates/` (modules don't ship codemod code; see Architecture rules)

In a **generated project**, `auth`, `db`, and `orm` modules install into their own internal workspace package at `packages/<dir>/` (named `@<manifest.name>/<dir>`); the app consumes them via `workspace:*` deps. `framework` and `styling` stay app-scoped because they wire the app shell itself. The mapping is hardcoded in [`SLOT_PACKAGE_DIR`](packages/registry/src/module.ts) — `auth → "auth"`, both `db` and `orm → "db"` (they share a single `packages/db/` package).

## Commands

- `bun apps/cli/src/bin.ts <verb>` — run CLI directly without build
- `pnpm registry:build` (or `bun scripts/registry-build.ts`) — regenerate `dist/registry/{index,modules/*}.json`
- `pnpm module:new [slot] [id]` — scaffold a new module under `registry/modules/`
- `pnpm --filter @stanza/web dev` — TanStack Start dev server; `predev` hook auto-copies `dist/registry/` → `apps/web/public/registry/` so the same-domain registry path resolves
- `pnpm lint` / `pnpm lint:fix` — Oxlint across the whole repo (config: `.oxlintrc.json`)
- `pnpm fmt` / `pnpm fmt:check` — oxfmt across the whole repo (config: `.oxfmtrc.json`)
- `cd packages/<x> && node_modules/.bin/vitest run` — unit tests (per workspace; no root `vitest` binary)
- `cd <pkg> && node_modules/.bin/tsc --noEmit` — typecheck (per workspace)
- `cd apps/web && node_modules/.bin/vite build` — generates `src/routeTree.gen.ts` (required before first typecheck)
- E2E smoke: seed `$TMPDIR/x` with `stanza.json` + `apps/web/package.json`, then `bun .../bin.ts add <slot> <module>`

## Toolchain invariants

- pnpm 10 + `node-linker: isolated` — each workspace MUST declare `@types/node` in its own devDeps and set `types: ["node"]` in tsconfig (auto-discovery doesn't reach into the isolated `node_modules/@types`)
- TypeScript 6 — `allowImportingTsExtensions: true` + `noEmit: true` is set in `tsconfig.json`; build with `bun build`, not `tsc`
- `tsconfig.json` excludes `**/templates/**` globally — template files target user projects, not this repo
- Zod 4: use `z.partialRecord(K, V)` for finite-key partial records (`z.record(z.enum, V)` requires exhaustive keys)
- TanStack Start: `verbatimModuleSyntax: false` in `apps/web/tsconfig.json` (server bundles leak otherwise); `tanstackStart()` MUST precede `react()` in vite plugins
- Bun runs the CLI directly from `.ts`; don't add a TS compile step

## Architecture rules

- **Modules are vendored**: their templates land in the user's repo verbatim; no `@stanza/runtime` dep
- **Template distribution**: `scripts/registry-build.ts` inlines each template file's contents into the per-module JSON's `templates[].content` field so HTTP-loaded manifests are self-contained. The runner prefers `tpl.content` and only reads from `registry/modules/<x>/templates/` when it's absent (local dev). New templates need no build wiring — they're picked up automatically
- **Module logos**: drop `logo.svg` (theme-agnostic) or `logo-light.svg` + `logo-dark.svg` (theme pair) in a module's directory. The registry build auto-detects and inlines as `mod.logo` (string or `{ light, dark }`) — module authors don't declare anything in `module.ts`. First-party logos come from [svgl.app](https://svgl.app). The web builder renders inline via `dangerouslySetInnerHTML`
- **Registry is data; CLI is the runtime**: the per-module JSON ships templates (text), deps (strings), env (strings), scripts (strings), logos (SVG markup), and codemod **invocations** (`{ id, args }`). It does NOT ship codemod _code_. The catalog of generic codemods lives in [packages/codemods/src/builtins/](packages/codemods/src/builtins/) and is exposed via the `@stanza/codemods/builtins` subpath export — each codemod is parameterized by `TArgs` and reusable across modules (`wrap-root-layout` serves both Clerk and any future provider-style auth/state library). The catalog is statically imported into the CLI binary at build time, so distribution shape (single binary, pnpm-isolated, npm-hoisted, `npx`, `bun --compile`) doesn't matter — implementations always travel with the runtime
- **Adding a generic codemod**: drop `<id>.ts` under [packages/codemods/src/builtins/](packages/codemods/src/builtins/), default-export a `Codemod<TArgs>`, and register it in [packages/codemods/src/builtins/index.ts](packages/codemods/src/builtins/index.ts). Codemods that bake in module-specific identifiers don't belong — factor them into args
- **Third-party codemods**: deferred. Third-party HTTP-loaded modules can use the existing catalog codemods (pass `{ id, args }` from their manifest) but can't add new ones until we land a proper sandboxed-execution + signing model
- **apps/web previews are server-rendered**: Shiki runs in `apps/web/src/server/highlighter.ts` (module-singleton, kept warm). The builder loader (`createServerFn` in `apps/web/src/server/builder-state.ts`) computes selected files from URL search params, pre-renders Shiki HTML for each, and ships `Record<path, { light, dark }>` to the client. `shiki` must NEVER be imported from a client component — verified by `vite build` followed by `grep shiki .output/public/assets/*.js` (should return nothing)
- **Slot taxonomy** is currently `framework | styling | db | orm | auth` (see `KNOWN_SLOTS`); adding a slot is a manifest schema bump — update `KNOWN_SLOTS`, `slotOrder`, the Zod manifest schema, and `SLOT_PACKAGE_DIR` together (decide whether the new slot extracts into its own package or stays app-scoped)
- **Adapter keys** encode peer choices (e.g., `next+drizzle`); the resolver picks the most specific match
- **Slot-package extraction**: `auth`/`db`/`orm` modules install into `packages/<dir>/` workspace packages (named `@<manifest.name>/<dir>`); templates `scope: "package"`, deps/devDeps/scripts route there, and the app gets a `workspace:*` dep wired by the runner. `framework`/`styling` stay app-scoped (their `SLOT_PACKAGE_DIR` entry is `null`). The bootstrap files (the package's `package.json` + `tsconfig.json` and the host app's workspace dep) are **system-owned** — not tracked in `regions`. `stanza remove`'s sweep deletes them when no claims remain under `packages/<dir>/`
- **Generated projects don't share a tsconfig base**: every `apps/*/tsconfig.json` and `packages/*/tsconfig.json` is self-contained. The framework module ships the app's tsconfig; the runner's `ensureSlotPackage` writes a matching self-contained config when bootstrapping a slot package. `tsconfig.json` lives in the stanza repo only; do not emit it in generated trees
- **Cross-package wiring**: when an adapter's source code imports from another internal package (e.g. `better-auth`'s `auth.ts` reads `db` from the orm package), declare `peerPackages: ["db"]` on the adapter. The runner adds `@<project>/db: workspace:*` to the current package's `package.json`. Templates can reference other packages via `{{<dir>PackageName}}` substitution (e.g. `{{dbPackageName}}` → `@my-app/db`) — substitution runs over both template bodies (when `template: true`) and codemod-invocation `args` string values
- **Region ownership** in `stanza.json` is the source of truth for `remove`/future-`swap`; two modules claiming the same region is a hard error (`RegionConflictError`)
- **Declarative beats imperative**: prefer `templates`/`dependencies`/`env`/`scripts` over imperative codemods; the runner applies declarative fields generically
- **Reserved manifest fields**: `modules[slot].version` and `regions` are written today but only fully consumed by the upcoming `swap`/`update` verbs — do not drop them

## Module authoring

- `module.ts` exports `defineModule({...})` with at least one adapter (use `match: {}` for "default / no peer")
- Templates go in `templates/`, referenced by `src` path. `scope` decides where `dest` lands:
  - `"app"` (default) → `manifest.appDir` (e.g. `apps/web/`)
  - `"repo"` → repo root
  - `"package"` → `packages/<SLOT_PACKAGE_DIR[slot]>/` — only valid for slots with a non-null entry (`auth`, `db`, `orm`)
- For `auth`/`db`/`orm` modules, default to `scope: "package"` for everything that can live inside the package boundary. Reach for `scope: "app"` only when a framework convention forces the file to sit at the app root (e.g. Next's `middleware.ts`, App Router API routes). App-scoped files should be thin shims that `import` from `{{packageName}}`; set `template: true` and the runner runs mustache substitution
- For cross-package imports (e.g. `auth` reading `db`), declare `peerPackages: ["<dir>"]` on the adapter so the runner adds the workspace dep, and write the import as `{{<dir>PackageName}}` (e.g. `import { db } from "{{dbPackageName}}";`)
- Framework modules MUST NOT ship a `package.json.tpl` — it collides with `addPackageDependency`. Let the runner merge deps into the host's package.json. The same rule applies to **package-scoped** modules: don't ship a `packages/<dir>/package.json` template — the runner's `ensureSlotPackage` bootstraps one and merges adapter deps in
- To invoke an imperative codemod from a module, add `codemods: [{ id: "<catalog-id>", args: {...} }]` to the adapter. Modules never ship code — if no catalog entry matches the need, design a new generic codemod with the right args. String values in `args` go through mustache substitution (same context as template bodies)
- For codemods that operate on files inside a slot's package (e.g. extending the orm's schema barrel from the auth module), pass `base: "package:<dir>"` to the catalog codemod — `re-export` and `append-to-file` both honor it

## Gotchas

- Clack spinners (`p.spinner()`) don't auto-stop on promise rejection — wrap awaits in try/catch and call `spinner.stop(...failed)` in the catch
- LSP diagnostics on template files (e.g. "Cannot find module 'react'") are noise; the global exclude works for `tsc` but tsserver still indexes them
- The dev registry is found by walking up from `import.meta.url` looking for `registry/modules/`; `STANZA_REGISTRY` env var overrides (FS path or HTTP URL)
- `pnpm install` says "Already up to date" when only workspace `package.json` files changed without lockfile-affecting bumps — use `pnpm install --force` to re-link
- Oxlint has _most_ but not all ESLint plugin rules — `prevent-abbreviations`, `react/jsx-uses-react`, etc. don't exist. Check `node_modules/oxlint/configuration_schema.json` if a rule name fails
- oxfmt auto-loads `.gitignore` and `.prettierignore`; we use `.oxfmtrc.json`'s `ignorePatterns` instead so we don't masquerade as a Prettier project
