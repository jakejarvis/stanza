# First-party module registry

This is the canonical roadmap for the first-party modules stanza ships. Each
entry maps to a `registry/modules/<slot>-<id>/` directory. Update this file
when a module lands, gets renamed, or is dropped.

Legend: `[x]` added · `[ ]` planned

## Categories: slots vs add-ons

Stanza's module taxonomy splits into two categories. **Slots** are
single-choice and constrain other modules' adapter dispatch (picking
Next.js influences which auth adapters are available). **Add-ons** can
coexist freely and don't influence anyone else's adapters (vitest doesn't
constrain anything).

| Category                                        | Type                                                                                  | Examples                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Slots** (constraint-bearing, one choice each) | `framework`, `styling`, `db`, `orm`, `auth`, `tooling`, `api`, `ai`, `ui`, `payments` | next vs tanstack-start; drizzle vs prisma |
| **Add-ons** (no constraints, many allowed)      | `testing`, `deploy`, `email`, `monorepo`                                              | vitest + playwright together              |

The add-on schema is **live** as of the `testing` modules. Add-ons are
modeled with a `kind: "addon"` discriminator on `Module` (carrying a
`category` instead of a `slot`) and a `manifest.addons` record keyed by
category, each holding a list of records (`Partial<Record<AddonCategoryId,
StanzaAddonRecord[]>>`). Add-on categories live in `KNOWN_ADDONS` /
`ADDON_CATEGORIES`, deliberately disjoint from `KNOWN_SLOTS` so they never
participate in peer resolution — yet they can still declare a one-way
`peers` (e.g. `{ framework: [...] }`) and framework-varying adapters.

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

_New **slot** (single-choice, constraint-bearing)._

- [ ] **stripe** — Checkout Sessions + webhooks
- [ ] **polar** — Polar SDK

## email

_New **add-on** (multi-allowed, no constraints)._

- [ ] **resend** — Resend SDK + React Email templates

## tooling

_**Slot** (single-choice)._ Lint/format toolchain. Modeled as a slot rather than an add-on because the three toolchains are mutually exclusive substitutes — you run one, not several. It bears no _outbound_ dispatch constraints (nothing peers on `tooling`) but consumes a `framework` peer where the config varies.

- [x] **eslint-prettier** — ESLint flat config + Prettier; per-framework adapters (next, tanstack-start)
- [x] **biome** — Biome (lint + format), framework-agnostic
- [x] **oxlint-oxfmt** — Oxlint + oxfmt, framework-agnostic

## testing

_New **add-on**._ Vitest and Playwright are independent and routinely coexist.

- [x] **vitest** — unit + integration; per-framework adapters (next, tanstack-start), `jsdom` + RTL, `test`/`test:watch` scripts
- [x] **playwright** — e2e; per-framework `webServer` (`next dev` / `vite dev`), `test:e2e`/`test:e2e:ui` scripts (disjoint from vitest's)

## deploy

_New **add-on**._

- [ ] **vercel** — `vercel.json` + framework-specific output
- [ ] **cloudflare** — Workers / Pages adapter per framework
- [ ] **railway** — `railway.toml` + Dockerfile
- [ ] **docker** — generic `Dockerfile` + compose for self-host

## monorepo

_Currently hardcoded in `bootstrapShell` as Turborepo. Promotes to an **add-on** when a second option (Nx, Moonrepo) lands._

- [x] **turborepo** — Turbo 2.x (current default; not yet a configurable choice)

## packageManager

_Not a slot — a top-level field in `stanza.json` (`packageManager: "pnpm" | "bun" | "npm"`). Wizard prompts; codemods only touch `package.json`, never lockfiles._

- [x] pnpm (default)
- [x] bun
- [x] npm
- [ ] yarn — needs lockfile/workspace handling that differs from the others

## Slot-package extraction

Generated projects place each slot's output in one of two homes:

- **App-scoped** (`framework`, `styling`) — files land in `manifest.appDir` (e.g. `apps/web/`). These slots wire the app shell itself, so there's no useful extraction boundary.
- **Package-scoped** (`auth`, `db`, `orm`) — files land in `packages/<dir>/`, named `@<manifest.name>/<dir>`, and the app gets a `workspace:*` dep. `db` and `orm` share a single `packages/db/` package so the ORM client sits next to the schema it queries.

The mapping lives in the canonical [`SLOTS`](packages/registry/src/module.ts) array as the `packageDir` field — `SLOT_PACKAGE_DIR` is just a `Record<SlotId, ...>` view derived from it. When you add a new slot, decide upfront whether it extracts (data layer, observability, payments) or wires the shell (router, UI primitives that mount in `<html>`) and set `packageDir` accordingly.

## Slot taxonomy changes required

Adding a new slot is now a **two-line edit**: append the id to `KNOWN_SLOTS` (the `as const` tuple Zod needs) and append a `Slot` entry to `SLOTS` with `{ id, label, description, packageDir }`. Order is topological — earlier slots become peer candidates for later ones. Existing `stanza.json` files don't break: new slots are optional, so adding them is additive.

Adding an add-on **category** is the same two-line edit against `KNOWN_ADDONS` + `ADDON_CATEGORIES`. Authoring an add-on **module** sets `kind: "addon"` + `category` (instead of `slot`) on `defineModule`; the manifest's `addons` record and the runner/CLI/web surfaces already handle multi-choice. See the category table at the top of this file for which planned modules are add-ons vs slots.
