# TODO

State at end of last session: the core architecture is end-to-end functional. `stanza add` composes modules across slots (verified: `framework next` → `db sqlite` → `orm drizzle` → `auth better-auth` produces a working tree with the right adapter selection). 20 unit tests pass. apps/web is a minimal Vite-native TanStack Start scaffold — needs the actual builder UI.

## Web app (apps/web) — priority

The builder is functionally wired but visually unfinished. It's inline-styled radios + a code block.

- [ ] Add Tailwind 4 to `apps/web` — use the `@tailwindcss/vite` plugin (mirror what the `styling-tailwind` module emits for the `tanstack-start` adapter)
- [ ] Hand-roll a small component layer or pull in shadcn (web variant) for cards, buttons, inputs, code blocks
- [ ] Replace the radio-list `Builder` with a card grid per slot, showing module label + description + homepage link
- [ ] Show _why_ a module is filtered out (e.g. "needs `framework: next`, you picked tanstack-start") instead of just dropping it
- [ ] Deep linking: encode selections in URL search params (`?framework=next&orm=drizzle&...`) so users can share configurations
- [ ] Copy-to-clipboard for the generated `pnpm create stanza ...` command
- [ ] Preview pane: list of files stanza will write (derived from `module.adapters[].templates[].dest` for the selected adapter combo)
- [ ] Show pinned npm versions per selected module (from `adapter.dependencies` / `adapter.devDependencies`)
- [ ] Module detail route at `/m/$slot/$id` — full description, all adapters, deps, env vars, templates list
- [ ] Search route at `/search` backed by the same registry index
- [ ] Layout: header (logo, GitHub link, docs link), footer
- [ ] Dark mode (Tailwind 4 `light-dark()` + system pref)
- [ ] SEO: meta tags via `head()` on routes, OG image, sitemap
- [ ] Host the registry on the same domain — wire `packages/registry-build` output to `apps/web/public/registry/` and serve statically, or via a Vercel route handler
- [ ] Vercel deploy config — `vercel.json` if needed, env vars for `STANZA_REGISTRY` (point dev at local FS, prod at the deployed CDN path)
- [ ] Docs section (could be MDX routes): overview, authoring guide, registry spec

## CLI (apps/cli)

The wizard and verbs work but a few things from the plan are stubbed.

- [ ] Implement opt-out PostHog telemetry — wire `posthog-node` (already a dep), prompt on first run, store a `telemetryId` in `stanza.json`, respect `--no-telemetry` and `DO_NOT_TRACK=1`
- [ ] `--yes` flag for non-interactive `init` — pick defaults via flags (`--framework=next` etc.); essential for CI tests
- [ ] HTTP registry loader path is implemented but unverified — smoke test against the static JSON output
- [ ] `stanza init`: today's `bootstrapShell` doesn't include `tsconfig.json` at the repo root for the generated project, and doesn't emit `turbo.json`. Decide whether stanza ships those or modules do
- [ ] Better error messages for `RegionConflictError` (current message is technical; should suggest `stanza remove <slot>` or manual cleanup)
- [ ] `bun build` the CLI for publish — script exists, not yet exercised
- [ ] Tests for command handlers (`init`, `add`, `remove`) — current coverage is just codemods + resolver

## Modules

Functional but a few real issues to fix.

- [ ] `auth-better-auth` tanstack-start adapter references `import.meta.env.VITE_BETTER_AUTH_URL` but the env var is declared as `BETTER_AUTH_URL` — either add `VITE_` prefix or read it server-side
- [ ] `auth-better-auth` auth schema (`shared/auth-schema.drizzle.ts`) is Postgres-only — needs a SQLite variant (different timestamp/boolean handling)
- [ ] `auth-clerk`: ships `layout-wrapper.tsx` (a `ClerkRootProvider`) but doesn't actually wire it into `app/layout.tsx` — needs an imperative codemod to wrap `<body>` children
- [ ] `styling-tailwind` + `framework-next` adapter writes `app/globals.css` over the framework's own — confirm the merge order produces the right import (`@import "tailwindcss"`)
- [ ] First imperative codemod example to validate the codemod-runner's `loadCodemods()` path — try ClerkProvider wrapping
- [ ] Authoring guide: docs page covering `defineModule`, slot/peer/capability semantics, template vs. codemod choice, region ownership

## Registry expansion

The full first-party module roadmap lives in [REGISTRY.md](REGISTRY.md). These are the schema/resolver changes needed before most of those modules can land.

- [ ] Add new slots to `KNOWN_SLOTS` + `slotOrder`: `api`, `ai`, `ui`, `payments`, `email`, `tooling`, `testing`, `deploy`. Decide ordering for the wizard's topological prompts (deploy last; testing/tooling near the end; api/ai after framework)
- [ ] Multi-choice slot support — `testing` is the first slot where two modules co-exist (vitest + playwright). Either (a) make the slot value `string[]` in `stanza.json` and update the resolver/UI, or (b) split into `testing-unit` + `testing-e2e` sub-slots. Pick before implementing the testing modules
- [ ] Capability tag expansion — current set is `web | native | react | node | edge | ssr | rsc`. Adding Nuxt/Svelte/Solid needs `vue`, `svelte`, `solid` capabilities; existing React-only modules must add `requires: ['react']` so the resolver filters correctly
- [ ] `monorepo` is hardcoded to Turborepo in `bootstrapShell` — promote to a real slot only when a second option lands
- [ ] `packageManager` Yarn support — different workspace/lockfile semantics than pnpm/bun/npm; needs its own bootstrap branch
- [ ] Cross-framework adapter explosion — Better Auth, tRPC, oRPC, the AI SDKs, etc. each need a sub-adapter per framework (next/tanstack-start/nuxt/svelte/solid). Decide whether to ship them all in one module with many adapters, or split per framework. Lean toward many-adapters-per-module to keep the slot count sane

## Infrastructure

- [ ] GitHub Actions CI: typecheck (every workspace), unit tests, registry build, lint (add Biome or ESLint)
- [ ] Golden snapshot tests per module combination (per the plan's verification section) — for each valid `(framework, orm, db, auth, styling, pm)` tuple, run `stanza init` headless, snapshot the tree, compare against fixture
- [ ] Integration test for the canonical stack — Docker Postgres + Playwright sign-up flow
- [ ] Registry deploy pipeline — on push to main, build `dist/registry/` and push to Vercel/CF
- [ ] npm publish workflow for `@stanza/cli` + `create-stanza` (Changesets recommended; no changesets config yet)
- [ ] `.env.example` at repo root listing `STANZA_REGISTRY`, PostHog key, etc.

## Open items from the plan

- [ ] Domain clearance — confirm `stanza.dev` / `stanza.sh` availability + decide
- [ ] npm scope clearance — `@stanza` scope availability (the CLI assumes `@stanza/cli`); fall back to unscoped `stanza` if taken
- [ ] Better Auth vs Clerk feature parity — Clerk wraps its own UI, Better Auth is headless; document the difference or ship shared UI stubs (`SignInForm`, callback page) that each adapter fills in

## Out of scope for now

These are real future work but consciously deferred — don't pull them in opportunistically.

- `stanza swap <slot> <to>` — manifest already records `version` + `regions` to support it
- `stanza update` — pinned-version 3-way merge
- Third-party registry hosting — the spec exists implicitly; publish it formally later
- React Native / Expo modules — needs the `native` capability + cross-platform framework slot
- Additional first-party modules — full catalog tracked in [REGISTRY.md](REGISTRY.md); land the slot taxonomy changes above first
