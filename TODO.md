# TODO

State at end of last session: web-app QA polish + server-route refactor landed.
Fixed: CMD+K palette crash (missing `<Command>` wrapper), file-tree going stale
on selection change, file-tree ignoring light theme, OG cards inverting brand
logos, unstyled 404, and a Base UI native-`<button>` warning. Converted the
`/og`, `/og/$slot/$id`, and `/sitemap.xml` endpoints from a standalone Nitro
`server/` dir to TanStack Start server routes in `src/routes/`, and adopted the
framework's server-fn file-organization convention under `apps/web/src/server/`:
`*.functions.ts` for `createServerFn` wrappers (safe to import anywhere),
`*.server.ts(x)` for server-only code (Shiki, `@vercel/og` cards, fs registry
reads), and plain `*.ts` for client-safe types (the `Preview` type).

Prior session: pre-1.0 architectural cleanup landed.

- **B1–B6** (mechanical cleanup): `SLOTS` array is now the source of truth (was 5 hardcoded copies); `pickRegistryRoot` deduped; dead `telemetryId` removed; codemod-not-found error now includes module/adapter context; orphan HTTP-bundle comment dropped; `lazyProject` returns a clean `{ get, save }` object.
- **A3**: deleted `Module.provides`/`Module.requires`/`Capability` — they were declared but never read by the resolver. Peer constraints already encode the same info more precisely.
- **A1**: hoisted module-level install fields (`dependencies`, `devDependencies`, `env`, `scripts`, `consumesPackages`). Adapters override per-key when needed. Better Auth's 6 adapters no longer duplicate `dependencies`, `env`, or workspace deps.
- **A4**: web app is now the canonical registry host. `prebuild` builds + copies the registry into `apps/web/public/registry/`; deployed Vercel output ships it; the CLI's default URL points at the same path.
- **A2 deferred**: the add-on schema (`manifest.addons[]` + `kind` discriminator) is intentionally postponed until the first real add-on module forces concrete design decisions. Categorization documented in [REGISTRY.md](REGISTRY.md).
- Cross-package wiring is now declared via module-level `consumesPackages` (was per-adapter `peerPackages`). `stanza add` composes modules across slots (verified: `framework next` → `db postgres` → `orm drizzle` → `auth better-auth` produces a working tree with the right adapter selection and the auth package depending on the db package). 49 unit tests pass. apps/web is a minimal Vite-native TanStack Start scaffold — needs the actual builder UI.

## Web app (apps/web) — priority

The builder is functionally wired but visually unfinished. It's inline-styled radios + a code block.

- [x] Add Tailwind 4 to `apps/web` — `@tailwindcss/vite` v4 wired in `vite.config.ts`, theme variables in `styles.css` via `@theme` (OKLCH), dark mode via `.dark` class
- [x] Hand-roll a small component layer or pull in shadcn (web variant) — shadcn-style primitives at `apps/web/src/components/ui/` (Card, Button, Input, Badge, Tooltip, Tabs, DropdownMenu, Separator, Sonner). All use base-ui under the hood
- [x] Replace the radio-list `Builder` with a card grid per slot — `apps/web/src/components/builder/slot-cards.tsx`
- [ ] Show _why_ a module is filtered out (e.g. "needs `framework: next`, you picked tanstack-start") instead of just dropping it — partly covered by the tooltip in `slot-cards.tsx`, could expand to inline why-disabled copy on the card itself
- [x] Deep linking: encode selections in URL search params (`?framework=next&orm=drizzle&...`) — typed `validateSearch` on `routes/index.tsx`, parser in `lib/selection.ts`
- [x] Copy-to-clipboard for the generated `pnpm create stanza ...` command — `command-bar.tsx`
- [x] Preview pane: list of files stanza will write — `file-preview.tsx` with `@pierre/trees` + Shiki-rendered server-side preview. The tree re-seeds via `model.resetPaths()` on selection change (the `useFileTree` model is created once and isn't path-reactive on its own) and follows the app theme via `themeToTreeStyles()` so the shadow-DOM tree matches light/dark instead of `prefers-color-scheme`
- [x] Show pinned npm versions per selected module — `apps/web/src/components/detail/deps-table.tsx` on `/m/$slot/$id` (also covers devDeps + scripts + env). Builder cards stay clean per the design call; versions surface on the detail page
- [x] Module detail route at `/m/$slot/$id` — full description, adapter switcher (peer chip rows), deps tables, env table, templates list with click-to-expand Shiki preview, "Try it" command. `apps/web/src/routes/m.$slot.$id.tsx`
- [x] Search route — implemented as a header-only popover (`apps/web/src/components/search/site-search.tsx`) bound to ⌘K, mirrors the CLI's id/label/description/slot match (`lib/module-search.ts`)
- [x] Layout: header (logo, GitHub link, search), footer — `apps/web/src/components/header.tsx`, `footer.tsx`
- [x] Dark mode — Tailwind 4 `.dark` variant + ThemeProvider, system pref aware
- [x] SEO: meta tags via `head()` on routes, OG image, sitemap — `apps/web/src/lib/seo.ts` builds `head()` output with title/og:\*/twitter:\*/canonical for every route. Dynamic OG via `@vercel/og` at `/og/$slot/$id` and `/og`, and `sitemap.xml`, are TanStack Start **server routes** colocated in `apps/web/src/routes/` (`og.index.ts`, `og.$slot.$id.ts`, `sitemap[.]xml.ts`) via `createFileRoute(...).server.handlers.GET` — no separate Nitro `server/` dir or `serverDir` config. OG image URLs are extensionless (`/og/$slot/$id`, not `.png`) so they aren't swallowed by Vite/Nitro static-asset handling; crawlers read the `image/png` content-type. `public/robots.txt` is static
- [x] Host the registry on the same domain — `prebuild` script copies `dist/registry/` into `apps/web/public/registry/`. CLI's `DEFAULT_REGISTRY_URL` points at the same path. Server-side reads use the filesystem directly (`apps/web/src/server/registry-base.server.ts`) to avoid the SSR loopback-fetch deadlock
- [ ] Vercel deploy config — Vercel auto-detects TanStack Start's `.output/` directory, no `vercel.json` needed. Env vars (`STANZA_REGISTRY`) optional override
- [ ] Docs section (could be MDX routes): overview, authoring guide, registry spec

### UI polish / responsiveness

Functional + verified across desktop/tablet/mobile (375/768/1440) with
agent-browser, but a mobile pass is outstanding. The builder's two-column split
(`builder/index.tsx`) only kicks in at `lg`; below that the whole right column
(command bar + file preview) drops to the bottom of the page.

- [ ] Builder layout on small/medium screens — below `lg` the file preview sits
  under every slot card, so a phone user scrolls past all 5 slots before seeing
  any generated output. Consider surfacing the command bar (and a collapsed
  preview) above the cards on mobile, or a sticky bottom "preview" affordance.
- [ ] File-preview height on mobile (`file-preview.tsx`) — below `sm` the tree
  and code pane stack, giving two `max-h-[420px]` blocks back-to-back (~840px
  tall). Cap the combined height, make the tree collapsible, or shrink the tree
  pane to a file dropdown on phones.
- [ ] Command `<pre>` overflow (`command-bar.tsx`) — the `pnpm create stanza …`
  string scrolls horizontally inside the card on narrow viewports. Consider
  wrapping (`whitespace-pre-wrap break-all`) or a slightly smaller mono size on
  mobile so the full command is visible at a glance.
- [ ] Header density on phones (`header.tsx`) — the search trigger is
  `min-w-[180px]`; with the logo, GitHub button, and theme toggle it gets tight
  under ~360px. Collapse the search button to an icon-only trigger below `sm`.
- [ ] Slot-card touch targets / wrapping (`slot-cards.tsx`) — single column below
  `sm` is fine, but verify the logo + label + check-icon row and the
  `slot/id · vX` footer don't wrap awkwardly at the smallest widths; bump tap
  target padding for touch.
- [ ] Confirm the TanStack devtools floating button is dev-only (it overlaps
  cards/preview on small screens in `pnpm dev`) — it's mounted in `__root.tsx`;
  make sure it's stripped from the production build.
- [ ] Module detail page (`m.$slot.$id.tsx`) mobile pass — adapter-switcher chip
  rows and the deps/env tables are comfortable at `max-w-3xl`; spot-check the
  table key/value columns and the long "Try it" command don't overflow on phones.

## CLI (apps/cli)

The wizard and verbs work but a few things from the plan are stubbed.

- [ ] Implement opt-out PostHog telemetry — wire `posthog-node`, prompt on first run, respect `--no-telemetry` and `DO_NOT_TRACK=1`
- [x] `--yes` flag for non-interactive `init` — takes picks from `--framework / --styling / --db / --orm / --auth / --pm` flags; missing slots are skipped (explicit is better than auto-default)
- [ ] HTTP registry loader path is implemented but unverified — smoke test against the static JSON output
- [ ] `stanza init`: today's `bootstrapShell` doesn't emit `turbo.json`. Decide whether stanza ships that or a tooling module does. (The root `pnpm-workspace.yaml` is now correctly emitted with `packages/*`, and `apps/<dir>/package.json` is bootstrapped so the runner's dep merges aren't silent no-ops)
- [ ] Better error messages for `RegionConflictError` (current message is technical; should suggest `stanza remove <slot>` or manual cleanup)
- [x] Build the CLI for publish — `pnpm --filter @stanza/cli build` runs **tsdown**, producing `apps/cli/dist/bin.mjs` (~64 KB unminified; ~18 KB gzipped). External npm deps (`ts-morph`, `zod`, etc.) stay external — users get them via the normal npm install chain. Workspace deps (`@stanza/codemods`, `@stanza/registry`) are inlined. `create-stanza` builds the same way (744 bytes). The published bin runs on plain `node`; dev runs via `tsx watch ./src/bin.ts`. Bun is now gone from the dev workflow except as a maintainer-convenience shebang on `scripts/*.ts`
- [x] Tests for command handlers (`init`, `add`, `remove`) — 10 tests in `apps/cli/src/commands/commands.test.ts`, exercise `--yes` init, add to existing project, remove + slot-package sweep, cross-package dep cleanup

## Modules

Functional but a few real issues to fix.

- [x] `auth-better-auth` VITE_BETTER_AUTH_URL: stale — auth-client.ts defaults to current origin; server reads `BETTER_AUTH_URL` automatically. No template references VITE_BETTER_AUTH_URL.
- [x] `auth-better-auth` drizzle `auth.ts` hardcoded `provider: "pg"` — split into per-db templates (`auth.drizzle.postgres.ts` + `auth.drizzle.sqlite.ts`) so sqlite gets `provider: "sqlite"`
- [ ] `auth-better-auth` sqlite schema variant exists (`shared/auth-schema.drizzle-sqlite.ts`); confirm it matches what better-auth actually expects on SQLite end-to-end
- [x] `styling-tailwind` + `framework-next` `app/globals.css` conflict — fixed by switching styling-tailwind's next adapter to prepend `@import "tailwindcss";` via the `append-to-file` codemod's new `position: "start"` mode. Framework retains ownership of base styles; revert restores cleanly
- [x] tanstack-start globals.css orphan — fixed symmetrically to Next. framework-tanstack-start now ships `src/globals.css` and `__root.tsx` imports it; styling-tailwind's tanstack adapter prepends `@import "tailwindcss";` via `append-to-file` instead of writing the file. No new codemod needed; pattern is now identical across both framework adapters.
- [ ] Authoring guide: docs page covering `defineModule`, slot/peer/capability semantics, template vs. codemod choice, region ownership, and the `scope: "package"` + `consumesPackages` story

## Registry expansion

The full first-party module roadmap lives in [REGISTRY.md](REGISTRY.md). These are the schema/resolver changes needed before most of those modules can land.

- [ ] Add new slots to `KNOWN_SLOTS` + `slotOrder`: `api`, `ai`, `ui`, `payments`, `email`, `tooling`, `testing`, `deploy`. Decide ordering for the wizard's topological prompts (deploy last; testing/tooling near the end; api/ai after framework)
- [ ] Multi-choice slot support — `testing` is the first slot where two modules co-exist (vitest + playwright). Either (a) make the slot value `string[]` in `stanza.json` and update the resolver/UI, or (b) split into `testing-unit` + `testing-e2e` sub-slots. Pick before implementing the testing modules
- [ ] Capability tag expansion — current set is `web | native | react | node | edge | ssr | rsc`. Adding Nuxt/Svelte/Solid needs `vue`, `svelte`, `solid` capabilities; existing React-only modules must add `requires: ['react']` so the resolver filters correctly
- [ ] `monorepo` is hardcoded to Turborepo in `bootstrapShell` — promote to a real slot only when a second option lands
- [ ] `packageManager` Yarn support — different workspace/lockfile semantics than pnpm/bun/npm; needs its own bootstrap branch
- [ ] Cross-framework adapter explosion — Better Auth, tRPC, oRPC, the AI SDKs, etc. each need a sub-adapter per framework (next/tanstack-start/nuxt/svelte/solid). Decide whether to ship them all in one module with many adapters, or split per framework. Lean toward many-adapters-per-module to keep the slot count sane

## Infrastructure

- [x] GitHub Actions CI: lint, format check, registry build, web build (generates routeTree.gen.ts), typecheck (every workspace via turbo), tests, CLI bundle + smoke. Single workflow at `.github/workflows/ci.yml`
- [ ] Golden snapshot tests per module combination (per the plan's verification section) — for each valid `(framework, orm, db, auth, styling, pm)` tuple, run `stanza init` headless, snapshot the tree, compare against fixture
- [ ] Integration test for the canonical stack — Docker Postgres + Playwright sign-up flow
- [ ] Registry deploy pipeline — on push to main, build `dist/registry/` and push to Vercel/CF
- [x] npm publish workflow — Changesets configured (`.changeset/config.json`, public access, `@changesets/changelog-github` for PR links). [Release workflow](.github/workflows/release.yml) runs `changesets/action@v1` on push to main: opens a "Version Packages" PR when changesets queue up; merging publishes via `pnpm release` (build CLI + create-stanza, then `changeset publish`). Provenance attestations enabled. Tarball dry-run verified: `@stanza/cli` is 20 KB, `create-stanza` is 1.7 KB; both `npm install`-able from a clean tmpdir and `--version` / `--help` work. Repo needs `NPM_TOKEN` secret before the first publish
- [ ] `.env.example` at repo root listing `STANZA_REGISTRY`, PostHog key, etc.

## Open items from the plan

- [x] Domain — `stanza.tools` (registry served at `https://stanza.tools/registry`, web builder at `https://stanza.tools`)
- [ ] npm scope clearance — `@stanza` scope availability (the CLI assumes `@stanza/cli`); fall back to unscoped `stanza` if taken
- [ ] Better Auth vs Clerk feature parity — Clerk wraps its own UI, Better Auth is headless; document the difference or ship shared UI stubs (`SignInForm`, callback page) that each adapter fills in

## Out of scope for now

These are real future work but consciously deferred — don't pull them in opportunistically.

- `stanza swap <slot> <to>` — manifest already records `version` + `regions` to support it; slot-package extraction now means swap can replace the contents of `packages/<dir>/` without touching app imports
- `stanza update` — pinned-version 3-way merge
- Third-party registry hosting — the spec exists implicitly; publish it formally later
- React Native / Expo modules — needs the `native` capability + cross-platform framework slot
- Additional first-party modules — full catalog tracked in [REGISTRY.md](REGISTRY.md); land the slot taxonomy changes above first
