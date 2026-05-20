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
- `packages/internal/` — Internal maintenance scripts: `registry-build.ts` (emits static CDN JSON), `module-new.ts` (scaffolds a new module)
- `registry/modules/<slot>-<id>/` — first-party modules: `module.ts` + `templates/` (+ optional `codemods/`)

## Commands

- `bun apps/cli/src/bin.ts <verb>` — run CLI directly without build
- `pnpm registry:build` (or `bun packages/internal/src/registry-build.ts`) — regenerate `dist/registry/{index,modules/*}.json`
- `pnpm module:new [slot] [id]` — scaffold a new module under `registry/modules/`
- `pnpm lint` / `pnpm lint:fix` — Oxlint across the whole repo (config: `.oxlintrc.json`)
- `pnpm fmt` / `pnpm fmt:check` — oxfmt across the whole repo (config: `.oxfmtrc.json`)
- `cd packages/<x> && node_modules/.bin/vitest run` — unit tests (per workspace; no root `vitest` binary)
- `cd <pkg> && node_modules/.bin/tsc --noEmit` — typecheck (per workspace)
- `cd apps/web && node_modules/.bin/vite build` — generates `src/routeTree.gen.ts` (required before first typecheck)
- E2E smoke: seed `$TMPDIR/x` with `stanza.json` + `apps/web/package.json`, then `bun .../bin.ts add <slot> <module>`

## Toolchain invariants

- pnpm 10 + `node-linker: isolated` — each workspace MUST declare `@types/node` in its own devDeps and set `types: ["node"]` in tsconfig (auto-discovery doesn't reach into the isolated `node_modules/@types`)
- TypeScript 6 — `allowImportingTsExtensions: true` + `noEmit: true` is set in `tsconfig.base.json`; build with `bun build`, not `tsc`
- `tsconfig.base.json` excludes `**/templates/**` globally — template files target user projects, not this repo
- Zod 4: use `z.partialRecord(K, V)` for finite-key partial records (`z.record(z.enum, V)` requires exhaustive keys)
- TanStack Start: `verbatimModuleSyntax: false` in `apps/web/tsconfig.json` (server bundles leak otherwise); `tanstackStart()` MUST precede `react()` in vite plugins
- Bun runs the CLI directly from `.ts`; don't add a TS compile step

## Architecture rules

- **Modules are vendored**: their templates land in the user's repo verbatim; no `@stanza/runtime` dep
- **Slot taxonomy** is currently `framework | styling | db | orm | auth` (see `KNOWN_SLOTS`); adding a slot is a manifest schema bump — update `KNOWN_SLOTS`, `slotOrder`, and the Zod manifest schema together
- **Adapter keys** encode peer choices (e.g., `next+drizzle`); the resolver picks the most specific match
- **Region ownership** in `stanza.json` is the source of truth for `remove`/future-`swap`; two modules claiming the same region is a hard error (`RegionConflictError`)
- **Declarative beats imperative**: prefer `templates`/`dependencies`/`env`/`scripts` over imperative codemods; the runner applies declarative fields generically
- **Reserved manifest fields**: `modules[slot].version` and `regions` are written today but only fully consumed by the upcoming `swap`/`update` verbs — do not drop them

## Module authoring

- `module.ts` exports `defineModule({...})` with at least one adapter (use `match: {}` for "default / no peer")
- Templates go in `templates/`, referenced by `src` path; `scope: "app"` resolves against `manifest.appDir`, `scope: "repo"` against the repo root
- Framework modules MUST NOT ship a `package.json.tpl` — it collides with `addPackageDependency`. Let the runner merge deps into the host's package.json
- Codemod functions (when needed) live in `<module>/codemods/index.ts` as a default-exported map of `{ id: Codemod }`

## Gotchas

- Clack spinners (`p.spinner()`) don't auto-stop on promise rejection — wrap awaits in try/catch and call `spinner.stop(...failed)` in the catch
- LSP diagnostics on template files (e.g. "Cannot find module 'react'") are noise; the global exclude works for `tsc` but tsserver still indexes them
- The dev registry is found by walking up from `import.meta.url` looking for `registry/modules/`; `STANZA_REGISTRY` env var overrides (FS path or HTTP URL)
- `pnpm install` says "Already up to date" when only workspace `package.json` files changed without lockfile-affecting bumps — use `pnpm install --force` to re-link
- Oxlint has _most_ but not all ESLint plugin rules — `prevent-abbreviations`, `react/jsx-uses-react`, etc. don't exist. Check `node_modules/oxlint/configuration_schema.json` if a rule name fails
- oxfmt auto-loads `.gitignore` and `.prettierignore`; we use `.oxfmtrc.json`'s `ignorePatterns` instead so we don't masquerade as a Prettier project
