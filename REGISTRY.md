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

| Category                                        | Type                                                                       | Examples                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| **Slots** (constraint-bearing, one choice each) | `framework`, `styling`, `db`, `orm`, `auth`, `api`, `ai`, `ui`, `payments` | next vs tanstack-start; drizzle vs prisma     |
| **Add-ons** (no constraints, many allowed)      | `testing`, `tooling`, `deploy`, `email`, `monorepo`                        | vitest + playwright together; eslint or biome |

Today's CLI/manifest only models slots. The add-on schema (likely a
`manifest.addons[]` array + `kind` discriminator on `Module`) is
intentionally deferred — it should be designed around real add-on modules,
not in a vacuum. The first add-on (probably `testing-vitest`) will force the
schema decisions.

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

- [x] **tailwind** — Tailwind v4, adapters per framework

## ui

_New **slot** (single-choice, constraint-bearing)._ Layered on top of `styling`; provides component primitives.

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

_New **add-on**._ Lint/format toolchain. Conventionally one per project but doesn't constrain others.

- [ ] **eslint-prettier** — ESLint + Prettier
- [ ] **biome** — Biome (lint + format)
- [ ] **oxlint-oxfmt** — Oxlint + oxfmt

## testing

_New **add-on**._ Vitest and Playwright are independent and routinely coexist.

- [ ] **vitest** — unit + integration
- [ ] **playwright** — e2e

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

Adding an add-on category is a larger lift because the manifest schema doesn't model add-ons yet. When the first add-on lands, expect to introduce `manifest.addons[]` and a discriminator on `Module`. See the category table at the top of this file for which planned modules are add-ons vs slots.
