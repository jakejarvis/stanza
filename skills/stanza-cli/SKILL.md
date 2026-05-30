---
name: stanza-cli
description: Use the npm-distributed Stanza CLI non-interactively to scaffold or modify modular full-stack TypeScript monorepos. Use when a user asks an agent to run `stanza`, `create-stanza`, `npm create stanza`, add/remove/list/search Stanza modules, generate a Stanza project in CI, or work with a Stanza-based TypeScript monorepo.
---

# Stanza CLI

Use only the published CLI surface. Do not assume the Stanza source repo, local `registry/modules`, maintainer scripts, or workspace packages are available unless the user explicitly provides them.

For depth this skill doesn't cover (the concept/region model, the full registry roadmap, and module authoring) fetch the complete docs at <https://stanza.tools/docs/llms-full.txt> when you have network access. For the current set of installable modules, `stanza search` is authoritative; the roadmap doc lags it.

## Runtime Contract

- The CLI package is `stanza-cli`; the binary is `stanza`.
- The create package is `create-stanza`; package-manager create commands forward to `stanza init`.
- Prefer direct npm execution in automation because it avoids package-manager argument-forwarding ambiguity:

```sh
npx -y stanza-cli@latest --help
npx -y stanza-cli@latest init my-app --yes --framework=next
```

- If the user wants create-style commands, use the correct separator for their package manager:

```sh
pnpm create stanza my-app --yes --framework=next
npm init stanza -- my-app --yes --framework=next
bun create stanza my-app --yes --framework=next
```

## Non-Interactive Workflow

1. Check the CLI surface before making assumptions:

```sh
npx -y stanza-cli@latest --help
npx -y stanza-cli@latest search
```

2. Discover current module IDs with `stanza search [query]`. Registry contents evolve, so do not hardcode a module unless the user specified it or `search` confirms it.

3. Scaffold with `init --yes`, passing every category you want explicitly:

```sh
npx -y stanza-cli@latest init my-app --yes \
  --framework=next \
  --ui=tailwind \
  --db=postgres \
  --orm=drizzle \
  --auth=better-auth \
  --testing=vitest,playwright \
  --pm=pnpm
```

4. Install dependencies using the generated manifest's package manager, then run the app's normal scripts:

```sh
cd my-app
pnpm install
pnpm dev
```

## Commands

- `stanza init [name] --yes ...` scaffolds a new project in a child directory of the current working directory. Today every `init` produces a single web app (`apps/web`, id `web`); multi-app init is planned but not yet exposed.
- `stanza add <category> [@<ns>/]<module> [--app=<id>]` adds one module to an existing Stanza project. The `--app` flag picks which app receives an app-scoped module (`framework`/`testing`) or which app a package-scoped module's shims (e.g. Better Auth's route handler) target. Single-app projects auto-target. Multi-app projects auto-pick if `cwd` is inside an app's `dir`; otherwise the CLI prompts interactively on a TTY or errors out in non-interactive runs. Prefix the id with `@<ns>/` to install from a third-party registry the project has declared under `registries` in `stanza.json`.
- `stanza remove <category> [[@<ns>/]<id>] [--app=<id>]` removes a module. For single-choice categories the `id` is optional; for multi-choice categories it is required. `--app` scopes removal in projects with multiple apps. The `@<ns>/` prefix is accepted for readability but not required — `remove` matches against the stored `id`.
- `stanza list` prints installed modules grouped by category from the nearest `stanza.json`.
- `stanza search [query]` lists registry modules and their `category/id` pairs.
- `stanza doctor` checks `stanza.json` against the filesystem for drift (claimed files/deps/scripts/env vars still present, internal packages wired) and reports issues. Read-only; exits non-zero when drift is found.

Run `add`, `remove`, `list`, and `doctor` from the project root or any child directory containing a parent `stanza.json`.

## Categories

Every module belongs to exactly one **category**, and each category is either single-choice or multi-choice:

- **Single-choice** categories: `framework`, `api`, `ui`, `db`, `orm`, `auth`, `payments`, `email`, `ai`, `tooling`, `monorepo`. Adding a module to a filled single-choice category fails until the existing one is removed.
- **Multi-choice** categories: `testing`, `deploy`. Multiple modules coexist in one category.

For `init --yes`, pass each category's module ids as a comma-separated value; single-choice categories take exactly one, multi-choice take several — for example `--framework=next` and `--testing=vitest,playwright`.

`--yes` never chooses defaults for omitted categories. Missing selections are skipped.

## Dependency Versions

- `init`/`add` bump each `^`/`~` dep range to the latest npm version satisfying it (keeping the modifier); other ranges and `workspace:*` are written as-is. Falls back to the declared range when offline.
- `STANZA_NO_NPM_LOOKUP=1` skips lookups (verbatim ranges); `STANZA_NPM_REGISTRY=<url>` overrides the npm registry.

## Safety Flags

- Use `--dry-run` before a mutating command when the user wants a preview. It writes nothing.
- Mutating commands refuse to run in a dirty git worktree. Ask the user before using `--dangerously-allow-dirty`; it intentionally allows Stanza edits to mix with existing changes.
- A failed `add` rolls back automatically — if any step throws (including a codemod), Stanza restores the worktree to its pre-`add` state.

## Registries

Stanza ships modules from the first-party `@stanza` namespace by default. To install modules from another publisher, declare the registry in `stanza.json#registries` and address its modules with `@<scope>/<id>` syntax.

Point a registry at the **full URL of its main JSON file** — the index, which lists every module and the relative `path` to its full JSON. The string form is that URL:

```json
{
  "registries": {
    "@acme": "https://reg.acme.example/index.json"
  }
}
```

```sh
stanza add testing @acme/cosmos
```

Editing `stanza.json#registries` is an expected user-driven edit (the rest of the manifest stays runner-managed). For auth or query params, use the object form:

```json
{
  "registries": {
    "@acme": {
      "url": "https://api.acme.example/r/registry.json",
      "headers": { "Authorization": "Bearer ${ACME_TOKEN}" },
      "params": { "channel": "stable" }
    }
  }
}
```

`url` is the full URL to the main JSON file (any filename — module paths in it are resolved relative to it; there is no `{category}`/`{id}` templating or directory convention). `${ENV_VAR}` expansion runs against `process.env`: unset vars in `headers` silently drop the header; unset vars in `params` are a hard error. Unknown namespaces fail fast — no implicit fallback to `@stanza`. `@stanza` itself is reserved and rejected if redeclared under `registries`.

`STANZA_REGISTRY=<url-or-path>` overrides the `@stanza` namespace's source only — set it to the **full URL or filesystem path to a registry's main JSON file** (not a directory), for a self-hosted mirror, air-gapped install, or CI fixture. It does NOT enable third-party modules.

## Telemetry

- The CLI sends anonymous usage events (command run, modules installed/removed — no PII, no identifier persisted). Disable per-invocation with `--no-telemetry`, or persistently with `STANZA_TELEMETRY=0` or `DO_NOT_TRACK=1`. Telemetry is auto-skipped in CI.

## Error Handling

- `Module not found`: run `stanza search` and use the displayed module id, not the label.
- `missing-peer`, `incompatible-peer`, or `no-adapter`: the selected module does not fit the current stack. Search for alternatives or add the required peer category first.
- `No stanza.json found`: run from a generated Stanza project, not the parent directory.
- Dirty worktree refusal: commit/stash user changes or ask before using `--dangerously-allow-dirty`.
- After adding package-scoped modules such as db/auth/orm, run the selected package manager install command so workspace packages link correctly.

## Agent Rules

- Treat generated files as user-owned project code after Stanza writes them.
- Don't synthesize `modules`, `regions`, or `readmeChecksum` in `stanza.json` — those are runner-managed. `registries`, `apps`, and `packageManager` are user config and may be edited.
- Prefer CLI commands over reconstructing Stanza's template output yourself.
- After mutating a project (or editing generated files), run `stanza doctor` to confirm `stanza.json` still matches the filesystem; it exits non-zero on drift.
- When reporting results, include the exact command run, whether it wrote files, and any follow-up package-manager command needed.
