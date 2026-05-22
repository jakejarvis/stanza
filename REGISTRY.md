# First-party module registry

This is the canonical roadmap for the first-party modules stanza ships. Each
entry maps to a `registry/modules/<category>-<id>/` directory. Update this file
when a module lands, gets renamed, or is dropped.

Legend: `[x]` added · `[ ]` planned

## Categories

Every module fills exactly one **category**. A category has two independent,
explicit properties (`CATEGORIES` in [`module.ts`](packages/registry/src/module.ts)):

- **`cardinality`** — `"one"` (single-choice: framework, auth) or `"many"`
  (coexisting: testing, deploy). This is the only thing that decides single- vs
  multi-select in the wizard/web and length in the manifest.
- **`home`** — where the module's output lands: `app` (manifest.appDir), `repo`
  (monorepo root), or `package` (`packages/<dir>/`).

Constraint-bearing is **emergent**, not a category property: a category is a
peer candidate only if some module declares `peers`/`match` against it, and the
resolver only treats `cardinality: "one"` categories as peers (`PEER_CATEGORIES`).

| Cardinality        | Categories                                                                            | Examples                                  |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| **one** (single)   | `framework`, `styling`, `db`, `orm`, `auth`, `tooling`, `api`, `ai`, `ui`, `payments` | next vs tanstack-start; drizzle vs prisma |
| **many** (coexist) | `testing`, `deploy`, `email`, `monorepo`                                              | vitest + playwright together              |

A `Module` carries a single `category` field (no `kind`/`slot`/`category`
discriminator). The manifest stores everything in one `modules` record keyed by
category, each holding an array (`Partial<Record<CategoryId,
StanzaModuleRecord[]>>`); `cardinality: "one"` categories are kept to ≤ 1 record
at install time. `selectedOne`/`selectedAll` read it ergonomically.

## framework

- [x] **tanstack-start** — TanStack Start on Vite (no Vinxi). Provides `web`, `react`, `ssr`, `node`
- [x] **next** — Next.js 16 (App Router). Provides `web`, `react`, `ssr`, `rsc`, `node`, `edge`
- [ ] **nuxt** — Vue. Will require relaxing the React-implicit assumption in many peer modules (capability tag `vue`)
- [ ] **svelte** — SvelteKit. Capability `svelte`
- [ ] **solid** — SolidStart. Capability `solid`

## api

_New **slot** (single-choice, constraint-bearing)._ Optional layer between the framework and the database/services.

- [ ] **trpc** — tRPC v11; per-framework adapters (next, tanstack-start, nuxt, svelte, solid)
- [ ] **orpc** — oRPC

## ai

_New **slot** (single-choice, constraint-bearing)._

- [ ] **vercel-ai-sdk** — `ai` package + provider sub-recipes
- [ ] **tanstack-ai** — TanStack AI

## auth

- [x] **better-auth** — headless, peers `orm: [drizzle, prisma]`, `framework: [next, tanstack-start]`
- [x] **clerk** — hosted UI, peers `framework: [next]` (TanStack Start adapter planned)
- [ ] **workos** — WorkOS AuthKit

## orm

- [x] **drizzle** — Drizzle ORM 0.45, peers `db: [postgres, sqlite]`
- [x] **prisma** — Prisma 7, peers `db: [postgres, sqlite]`

## db

- [x] **postgres** — `postgres` driver 3.4.x
- [x] **sqlite** — `better-sqlite3` 12.x

## styling

- [x] **tailwind** — Vanilla Tailwind v4, adapters per framework
- [ ] **shadcn-radix** — classic shadcn/ui (Radix primitives)
- [ ] **shadcn-base** — shadcn on react-base-ui

## payments

_New **slot** (single-choice, constraint-bearing)._ In addition to adding example files to the framework app, each of these have a plugin for better-auth -- add those too if better-auth is selected, either before or after this selection.

- [ ] **stripe** — Checkout Sessions + webhooks
- [ ] **polar** — Polar SDK
- [ ] **autumn**
- [ ] **dodo payments**

## email

_`cardinality: many`, app-scoped._

- [ ] **resend** — Resend SDK + React Email templates

## tooling

_`cardinality: one`, repo-scoped._ Lint/format toolchain — single-choice because the three toolchains are mutually exclusive substitutes. Bears no _outbound_ dispatch constraints (nothing peers on `tooling`) but consumes a `framework` peer where the config varies.

- [x] **eslint-prettier** — ESLint flat config + Prettier; per-framework adapters (next, tanstack-start)
- [x] **biome** — Biome (lint + format), framework-agnostic
- [x] **oxlint-oxfmt** — Oxlint + oxfmt, framework-agnostic

## testing

_`cardinality: many`, app-scoped._ Vitest and Playwright are independent and routinely coexist.

- [x] **vitest** — unit + integration; per-framework adapters (next, tanstack-start), `jsdom` + RTL, `test`/`test:watch` scripts
- [x] **playwright** — e2e; per-framework `webServer` (`next dev` / `vite dev`), `test:e2e`/`test:e2e:ui` scripts (disjoint from vitest's)

## deploy

_`cardinality: many`, repo-scoped._

- [ ] **vercel** — `vercel.json` + framework-specific output, add the nitro vite plugin for tanstack start
- [ ] **cloudflare** — Workers / Pages adapter per framework
- [ ] **railway** — `railway.toml` + Dockerfile
- [ ] **docker** — generic `Dockerfile` + compose for self-host

## monorepo

_`cardinality: many`, repo-scoped. Currently hardcoded in `bootstrapShell` as Turborepo; becomes a real category when a second option (Nx, Moonrepo) lands._

- [x] **turborepo** — Turbo 2.x (current default; not yet a configurable choice)

## packageManager

_Not a slot — a top-level field in `stanza.json` (`packageManager: "pnpm" | "bun" | "npm"`). Wizard prompts; codemods only touch `package.json`, never lockfiles._

- [x] pnpm (default)
- [x] bun
- [x] npm
- [ ] yarn — needs lockfile/workspace handling that differs from the others

## Install homes (package extraction)

A category's `home` places its modules' output in one of three places:

- **`app`** (`framework`, `styling`, `testing`, `email`) — files land in `manifest.appDir` (e.g. `apps/web/`). For categories that wire the app shell or test it.
- **`package`** (`auth`, `db`, `orm`) — files land in `packages/<dir>/`, named `@<manifest.name>/<dir>`, and the app gets a `workspace:*` dep. `db` and `orm` share a single `packages/db/` package so the ORM client sits next to the schema it queries.
- **`repo`** (`tooling`, `deploy`, `monorepo`) — config files land at the repo root and scripts/devDeps merge into the root `package.json`, because one config governs every workspace.

The mapping lives in the canonical [`CATEGORIES`](packages/registry/src/module.ts) array as the `home` tagged union. `categoryHome(id)` and `PACKAGE_DIRS` are derived views. When adding a category, pick the home that matches: data layer/payments → `package`; app shell/router → `app`; repo-wide tooling → `repo`.

## Adding a category

A **one-line edit**: append a `Category` entry to `CATEGORIES` with `{ id, label, description, cardinality, home }`. `CategoryId`, `KNOWN_CATEGORIES`, `PEER_CATEGORIES`, and `PACKAGE_DIRS` all derive from it — nothing else to keep in sync. Order is topological: a category must appear after every category it can peer on, and `many` (leaf) categories come last. Authoring a **module** sets a single `category` field on `defineModule`; the runner/CLI/web handle single- vs multi-choice off the category's `cardinality`. Existing `stanza.json` files don't break (new categories are optional).
