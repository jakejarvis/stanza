# First-party module registry

This is the canonical roadmap for the first-party modules stanza ships. Each
entry maps to a `registry/modules/<slot>-<id>/` directory. Update this file
when a module lands, gets renamed, or is dropped.

Legend: `[x]` added· `[ ]` planned

## framework

- [x] **tanstack-start** — TanStack Start on Vite (no Vinxi). Provides `web`, `react`, `ssr`, `node`
- [x] **next** — Next.js 16 (App Router). Provides `web`, `react`, `ssr`, `rsc`, `node`, `edge`
- [ ] **nuxt** — Vue. Will require relaxing the React-implicit assumption in many peer modules (capability tag `vue`)
- [ ] **svelte** — SvelteKit. Capability `svelte`
- [ ] **solid** — SolidStart. Capability `solid`

## api

_New slot._ Optional layer between the framework and the database/services.

- [ ] **trpc** — tRPC v11; per-framework adapters (next, tanstack-start, nuxt, svelte, solid)
- [ ] **orpc** — oRPC

## ai

_New slot._

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

_New slot._ Layered on top of `styling`; provides component primitives.

- [ ] **shadcn-radix** — classic shadcn/ui (Radix primitives)
- [ ] **shadcn-base** — shadcn on react-base-ui

## payments

_New slot._

- [ ] **stripe** — Checkout Sessions + webhooks
- [ ] **polar** — Polar SDK

## email

_New slot._

- [ ] **resend** — Resend SDK + React Email templates

## tooling

_New slot._ Lint/format toolchain. Single-choice slot.

- [ ] **eslint-prettier** — ESLint + Prettier
- [ ] **biome** — Biome (lint + format)
- [ ] **oxlint-oxfmt** — Oxlint + oxfmt

## testing

_New slot._ Multi-choice (unit + e2e are independent).

- [ ] **vitest** — unit + integration
- [ ] **playwright** — e2e

## deploy

_New slot._

- [ ] **vercel** — `vercel.json` + framework-specific output
- [ ] **cloudflare** — Workers / Pages adapter per framework
- [ ] **railway** — `railway.toml` + Dockerfile
- [ ] **docker** — generic `Dockerfile` + compose for self-host

## monorepo

_Currently hardcoded in `bootstrapShell` as Turborepo. Will become a slot if we ever add a Nx/Moonrepo alternative._

- [x] **turborepo** — Turbo 2.x (current default; not yet a configurable slot)

## packageManager

_Not a slot — a top-level field in `stanza.json` (`packageManager: "pnpm" | "bun" | "npm"`). Wizard prompts; codemods only touch `package.json`, never lockfiles._

- [x] pnpm (default)
- [x] bun
- [x] npm
- [ ] yarn — needs lockfile/workspace handling that differs from the others

## Slot taxonomy changes required

The slots `api`, `ai`, `ui`, `payments`, `email`, `tooling`, `testing`, `deploy` don't exist in `KNOWN_SLOTS` yet. Adding them is a manifest-schema bump and a `slotOrder` update in `packages/registry/src/resolver.ts`. Plan the rollout so existing `stanza.json` files don't break — new slots are optional, so adding them is additive.

`tooling` and `monorepo` are single-choice within their slot; `testing` is multi-choice (a project can have both vitest and playwright). The current resolver assumes single-choice — `testing` will need an array-valued slot or two sub-slots (`testing-unit`, `testing-e2e`).
