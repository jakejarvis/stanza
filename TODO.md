# TODO

State at end of last session: mobile/responsive pass on the web builder landed.
Command bar now surfaces above the slot cards below `lg`; file-preview tree is a
fixed height on mobile (it was collapsing to 0 since `@pierre/trees` needs a
definite height); command `<pre>`s wrap; header search collapses to an icon
below `sm`; disabled slot cards show a specific inline why-disabled reason. Also
fixed a theme bug: the file tree + Shiki previews rendered `github-light` on a
dark page for `system`/dark users — `ThemeProvider` now exposes a reactive
`resolvedTheme` and `FileTree` re-keys on it. Confirmed the TanStack devtools
button is stripped from the production build (no source gating needed). Details
under "UI polish / responsiveness" below.

Prior session: web-app QA polish + server-route refactor landed.
Fixed: CMD+K palette crash (missing `<Command>` wrapper), file-tree going stale
on selection change, file-tree ignoring light theme, OG cards inverting brand
logos, unstyled 404, and a Base UI native-`<button>` warning. Converted the
`/og`, `/og/$slot/$id`, and `/sitemap.xml` endpoints from a standalone Nitro
`server/` dir to TanStack Start server routes in `src/routes/`, and adopted the
framework's server-fn file-organization convention under `apps/web/src/server/`:
`*.functions.ts` for `createServerFn` wrappers (safe to import anywhere),
`*.server.ts(x)` for server-only code (Shiki, `@vercel/og` cards, fs registry
reads), and plain `*.ts` for client-safe types (the `Preview` type).

Session before that: pre-1.0 architectural cleanup landed.

- **B1–B6** (mechanical cleanup): `SLOTS` array is now the source of truth (was 5 hardcoded copies); `pickRegistryRoot` deduped; dead `telemetryId` removed; codemod-not-found error now includes module/adapter context; orphan HTTP-bundle comment dropped; `lazyProject` returns a clean `{ get, save }` object.
- **A3**: deleted `Module.provides`/`Module.requires`/`Capability` — they were declared but never read by the resolver. Peer constraints already encode the same info more precisely.
- **A1**: hoisted module-level install fields (`dependencies`, `devDependencies`, `env`, `scripts`, `consumesPackages`). Adapters override per-key when needed. Better Auth's 6 adapters no longer duplicate `dependencies`, `env`, or workspace deps.
- **A4**: web app is now the canonical registry host. `prebuild` builds + copies the registry into `apps/web/public/registry/`; deployed Vercel output ships it; the CLI's default URL points at the same path.
- **A2 deferred**: the add-on schema (`manifest.addons[]` + `kind` discriminator) is intentionally postponed until the first real add-on module forces concrete design decisions. Categorization documented in the [module registry](apps/web/content/docs/registry.mdx).
- Cross-package wiring is now declared via module-level `consumesPackages` (was per-adapter `peerPackages`). `stanza add` composes modules across slots (verified: `framework next` → `db postgres` → `orm drizzle` → `auth better-auth` produces a working tree with the right adapter selection and the auth package depending on the db package). 49 unit tests pass. apps/web is a minimal Vite-native TanStack Start scaffold — needs the actual builder UI.

## Web app (apps/web) — priority

The builder is functionally wired but visually unfinished. It's inline-styled radios + a code block.

- [x] Add Tailwind 4 to `apps/web` — `@tailwindcss/vite` v4 wired in `vite.config.ts`, theme variables in `styles.css` via `@theme` (OKLCH), dark mode via `.dark` class
- [x] Hand-roll a small component layer or pull in shadcn (web variant) — shadcn-style primitives at `apps/web/src/components/ui/` (Card, Button, Input, Badge, Tooltip, Tabs, DropdownMenu, Separator, Sonner). All use base-ui under the hood
- [x] Replace the radio-list `Builder` with a card grid per slot — `apps/web/src/components/builder/slot-cards.tsx`
- [x] Show _why_ a module is filtered out (e.g. "needs `framework: next`, you picked tanstack-start") instead of just dropping it — disabled cards now render a specific inline reason from the resolver error (`describeError` in `slot-cards.tsx`): `missing-peer` → "Pick a {Slot} module first.", `incompatible-peer` → "Doesn't pair with {peer} (your {Slot} pick).", `no-adapter` → generic. Inline (not just a `title` tooltip) so it works on touch
- [x] Deep linking: encode selections in URL search params (`?framework=next&orm=drizzle&...`) — typed `validateSearch` on `routes/index.tsx`, parser in `lib/selection.ts`
- [x] Copy-to-clipboard for the generated `pnpm create stanza ...` command — `command-bar.tsx`
- [x] Preview pane: list of files stanza will write — `file-preview.tsx` with `@pierre/trees` + Shiki-rendered server-side preview. The tree re-seeds via `model.resetPaths()` on selection change (the `useFileTree` model is created once and isn't path-reactive on its own) and follows the app theme via `themeToTreeStyles()`. Theme now comes from a reactive `resolvedTheme` exposed by `ThemeProvider` (computed post-mount) — the old per-component `useResolvedTheme` returned `"light"` during SSR and never re-rendered, so for `system`/dark users the tree + Shiki blocks rendered `github-light` on a dark page. The shadow-DOM tree captures `style` only at mount, so `FileTree` is also re-keyed on `resolvedTheme` to remount with the right palette (selection survives — `model` lives in the parent). Same fix applied to the detail page's `templates-list.tsx`
- [x] Show pinned npm versions per selected module — `apps/web/src/components/detail/deps-table.tsx` on `/m/$slot/$id` (also covers devDeps + scripts + env). Builder cards stay clean per the design call; versions surface on the detail page
- [x] Module detail route at `/m/$slot/$id` — full description, adapter switcher (peer chip rows), deps tables, env table, templates list with click-to-expand Shiki preview, "Try it" command. `apps/web/src/routes/m.$slot.$id.tsx`
- [x] Search route — implemented as a header-only popover (`apps/web/src/components/search/site-search.tsx`) bound to ⌘K, mirrors the CLI's id/label/description/slot match (`lib/module-search.ts`)
- [x] Layout: header (logo, GitHub link, search), footer — `apps/web/src/components/header.tsx`, `footer.tsx`
- [x] Dark mode — Tailwind 4 `.dark` variant + ThemeProvider, system pref aware
- [x] SEO: meta tags via `head()` on routes, OG image, sitemap — `apps/web/src/lib/seo.ts` builds `head()` output with title/og:\*/twitter:\*/canonical for every route. Dynamic OG via `@vercel/og` at `/og/$slot/$id` and `/og`, and `sitemap.xml`, are TanStack Start **server routes** colocated in `apps/web/src/routes/` (`og.index.ts`, `og.$slot.$id.ts`, `sitemap[.]xml.ts`) via `createFileRoute(...).server.handlers.GET` — no separate Nitro `server/` dir or `serverDir` config. OG image URLs are extensionless (`/og/$slot/$id`, not `.png`) so they aren't swallowed by Vite/Nitro static-asset handling; crawlers read the `image/png` content-type. `public/robots.txt` is static
- [x] Host the registry on the same domain — `prebuild` script copies `dist/registry/` into `apps/web/public/registry/`. CLI's `DEFAULT_REGISTRY_URL` points at the same path. `public/registry/` is also registered as a Nitro `serverAssets` dir (vite.config.ts), so its JSON is embedded in the server bundle and SSR reads it via `useStorage("assets:registry")` (`apps/web/src/server/registry-base.server.ts`) — works on serverless where `public/` is CDN-only, and avoids the SSR loopback-fetch deadlock
- [ ] Vercel deploy config — Vercel auto-detects TanStack Start's `.output/` directory, no `vercel.json` needed. Env vars (`STANZA_REGISTRY`) optional override
- [ ] Docs section (could be MDX routes): overview, authoring guide, registry spec

### UI polish / responsiveness

Mobile pass landed and verified with agent-browser at 360/375/1440 in both
light and dark. The builder's two-column split (`builder/index.tsx`) still
only kicks in at `lg`, but the command bar now surfaces above the cards below
`lg` so output is reachable without scrolling past every slot.

- [x] Builder layout on small/medium screens — the command bar is rendered
      twice in `builder/index.tsx`: a `lg:hidden` instance above the slot cards
      (so phones see the copy-able command first) and the original inside the
      `lg:sticky` right column (`hidden lg:block`). It's stateless (props from the
      URL), so duplicating it is cheap; the heavy `FilePreview` stays single.
- [x] File-preview height on mobile (`file-preview.tsx`) — tree pane is a fixed
      `h-[180px]` below `sm` (the virtualized `@pierre/trees` tree needs a definite
      height — `h-full` collapsed to 0 once the mobile `min-h` was dropped) and
      `sm:h-full` on desktop; code pane capped `max-h-[360px]` mobile /
      `sm:max-h-[480px]`. No more ~840px back-to-back blocks.
- [x] Command `<pre>` overflow (`command-bar.tsx` + detail `try-it.tsx`) — both
      use `whitespace-pre-wrap break-words` + `text-[11px] sm:text-xs` so the full
      `pnpm create stanza …` command wraps at spaces and is visible at a glance.
- [x] Header density on phones (`site-search.tsx`) — search trigger collapses to
      an icon-only button below `sm` (label + `⌘K` hint `hidden sm:inline`,
      `min-w` and wider padding gated to `sm:`).
- [x] Slot-card touch targets / wrapping (`slot-cards.tsx`) — verified clean at
      360px: single-column full-width cards, `p-4` tap targets, footer
      (`slot/id · vX`) and label/check row don't wrap.
- [x] Confirm the TanStack devtools floating button is dev-only — the TanStack
      Start plugin strips it from the production build automatically. Verified:
      `grep TanStackDevtools .output/public/assets/*.js` returns nothing after
      `pnpm --filter @stanza/web build` (so does `grep shiki`). No source gating
      needed.
- [x] Module detail page (`m.$slot.$id.tsx`) mobile pass — adapter chip rows,
      deps/env tables, and the (now-wrapping) "Try it" command all fit at 375px.

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

The full first-party module roadmap lives in the [module registry](apps/web/content/docs/registry.mdx). These are the schema/resolver changes needed before most of those modules can land.

- [x] **Unified `Category` taxonomy** — collapsed the slot/add-on split into one `Category` concept with two orthogonal, explicit axes: `cardinality` (`"one" | "many"`) and `home` (`app | repo | package`, replacing `packageDir`+`repoScoped`). `Module` is no longer a discriminated union — it carries a single `category` field. The manifest unified to one `modules: Partial<Record<CategoryId, StanzaModuleRecord[]>>` (arrays everywhere; `"one"` enforced ≤1 by `add`/`init`), bumping `CURRENT_MANIFEST_VERSION` 0.1→0.2 (clean break, no migration). Constraint-bearing is now emergent — the resolver iterates `PEER_CATEGORIES` (the `"one"` ids) only. Deleted `isAddon`/`moduleGroup`/`SlotModule`/`AddonModule`/`slotLabel`/`addonLabel`/`groupLabel`/`SLOT_PACKAGE_DIR`/`SLOT_REPO_SCOPED`/`ADDON_PACKAGE_DIR`/`KNOWN_SLOTS`/`KNOWN_ADDONS`; added `CATEGORIES`/`KNOWN_CATEGORIES`/`PEER_CATEGORIES`/`PACKAGE_DIRS`/`categoryHome`/`categoryCardinality`/`isMulti`/`categoryLabel`/`selectedOne`/`selectedAll`. Routing decided once in `categoryHome`, shared by the CLI runner + web `synthesizePackageJsons`. Wired through resolver/runner/CLI (add/remove/init/list/wizard, unified `--<category>` flags) + web builder (cards render single- vs multi-select off `isMulti`). All 14 modules migrated `slot`→`category`
- [ ] Add new categories to `CATEGORIES`: `api`, `ai`, `ui`, `payments` (all `cardinality: one`). Decide topological order for the wizard prompts (api/ai after framework)
- [ ] Capability tag expansion — current set is `web | native | react | node | edge | ssr | rsc`. Adding Nuxt/Svelte/Solid needs `vue`, `svelte`, `solid` capabilities; existing React-only modules must add `requires: ['react']` so the resolver filters correctly
- [ ] `monorepo` is hardcoded to Turborepo in `bootstrapShell` — promote to a real category when a second option lands
- [ ] `packageManager` Yarn support — different workspace/lockfile semantics than pnpm/bun/npm; needs its own bootstrap branch
- [ ] Cross-framework adapter explosion — Better Auth, tRPC, oRPC, the AI SDKs, etc. each need a sub-adapter per framework (next/tanstack-start/nuxt/svelte/solid). Decide whether to ship them all in one module with many adapters, or split per framework. Lean toward many-adapters-per-module to keep the category count sane

## Infrastructure

- [x] GitHub Actions CI: lint, format check, registry build, web build (generates routeTree.gen.ts), typecheck (every workspace via turbo), tests, CLI bundle + smoke. Single workflow at `.github/workflows/ci.yml`
- [ ] Golden snapshot tests per module combination (per the plan's verification section) — for each valid `(framework, orm, db, auth, styling, pm)` tuple, run `stanza init` headless, snapshot the tree, compare against fixture
- [ ] Integration test for the canonical stack — Docker Postgres + Playwright sign-up flow
- [ ] Registry deploy pipeline — on push to main, build `dist/registry/` and push to Vercel/CF
- [x] npm publish workflow — Changesets configured (`.changeset/config.json`, public access, `@changesets/changelog-github` for PR links). [Release workflow](.github/workflows/release.yml) runs `changesets/action@v1` on push to main: opens a "Version Packages" PR when changesets queue up; merging publishes via `pnpm release` (build CLI + create-stanza, then `changeset publish`). Provenance attestations enabled. Tarball dry-run verified: `stanza-cli` is 20 KB, `create-stanza` is 1.7 KB; both `npm install`-able from a clean tmpdir and `--version` / `--help` work. Repo needs `NPM_TOKEN` secret before the first publish
- [ ] `.env.example` at repo root listing `STANZA_REGISTRY`, PostHog key, etc.

## Open items from the plan

- [x] Domain — `stanza.tools` (registry served at `https://stanza.tools/registry`, web builder at `https://stanza.tools`)
- [x] npm name clearance — locked down unscoped `stanza-cli` and `create-stanza` on npm; the CLI publishes as `stanza-cli` (binary stays `stanza`)
- [ ] Better Auth vs Clerk feature parity — Clerk wraps its own UI, Better Auth is headless; document the difference or ship shared UI stubs (`SignInForm`, callback page) that each adapter fills in

## Out of scope for now

These are real future work but consciously deferred — don't pull them in opportunistically.

- `stanza swap <slot> <to>` — manifest already records `version` + `regions` to support it; slot-package extraction now means swap can replace the contents of `packages/<dir>/` without touching app imports
- `stanza update` — pinned-version 3-way merge
- Third-party registry hosting — the spec exists implicitly; publish it formally later
- React Native / Expo modules — needs the `native` capability + cross-platform framework slot
- Additional first-party modules — full catalog tracked in the [module registry](apps/web/content/docs/registry.mdx); land the slot taxonomy changes above first
