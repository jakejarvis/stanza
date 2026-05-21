---
name: stanza-cli
description: Use the npm-distributed Stanza CLI non-interactively to scaffold or modify modular full-stack TypeScript monorepos. Use when a user asks an agent to run `stanza`, `create-stanza`, `npm create stanza`, add/remove/list/search Stanza modules, generate a Stanza project in CI, or work with a Stanza-based TypeScript monorepo.
---

# Stanza CLI

Use only the published CLI surface. Do not assume the Stanza source repo, local `registry/modules`, maintainer scripts, or workspace packages are available unless the user explicitly provides them.

## Runtime Contract

- The CLI package is `@stanza/cli`; the binary is `stanza`.
- The create package is `create-stanza`; package-manager create commands forward to `stanza init`.
- Prefer direct npm execution in automation because it avoids package-manager argument-forwarding ambiguity:

```sh
npx -y @stanza/cli@latest --help
npx -y @stanza/cli@latest init my-app --yes --framework=next
```

- If the user wants create-style commands, use the correct separator for their package manager:

```sh
pnpm create stanza@latest my-app --yes --framework=next
npm create stanza@latest -- my-app --yes --framework=next
bun create stanza@latest my-app --yes --framework=next
```

## Non-Interactive Workflow

1. Check the CLI surface before making assumptions:

```sh
npx -y @stanza/cli@latest --help
npx -y @stanza/cli@latest search
```

2. Discover current module IDs with `stanza search [query]`. Registry contents evolve, so do not hardcode a module unless the user specified it or `search` confirms it.

3. Scaffold with `init --yes`, passing every wanted slot/add-on explicitly:

```sh
npx -y @stanza/cli@latest init my-app --yes \
  --framework=next \
  --styling=tailwind \
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

- `stanza init [name] --yes ...` scaffolds a new project in a child directory of the current working directory.
- `stanza add <slot|category> <module>` adds one module to an existing Stanza project.
- `stanza remove <slot|category> [id]` removes a slot module; add-ons require the module id.
- `stanza list` prints installed slots and add-ons from the nearest `stanza.json`.
- `stanza search [query]` lists registry modules and their `group/id` pairs.

Run `add`, `remove`, and `list` from the project root or any child directory containing a parent `stanza.json`.

## Slots And Add-Ons

Current slot names are `framework`, `styling`, `db`, `orm`, and `auth`. Slots are single-choice: adding a filled slot fails until the existing slot is removed.

Current add-on categories are `testing`, `tooling`, `deploy`, `email`, and `monorepo`. Add-ons are multi-choice, so multiple modules can coexist in one category. For `init --yes`, pass add-on ids as comma-separated values, for example `--testing=vitest,playwright`.

`--yes` never chooses defaults for omitted slots or add-ons. Missing selections are skipped.

## Dependency Versions

- `init`/`add` bump each `^`/`~` dep range to the latest npm version satisfying it (keeping the modifier); other ranges and `workspace:*` are written as-is. Falls back to the declared range when offline.
- `STANZA_NO_NPM_LOOKUP=1` skips lookups (verbatim ranges); `STANZA_NPM_REGISTRY=<url>` overrides the npm registry.

## Safety Flags

- Use `--dry-run` before a mutating command when the user wants a preview. It writes nothing.
- Mutating commands refuse to run in a dirty git worktree. Ask the user before using `--dangerously-allow-dirty`; it intentionally allows Stanza edits to mix with existing changes.
- Use `STANZA_REGISTRY=<url-or-path>` only when the user asks for a custom/self-hosted registry or test fixture. Otherwise let the published CLI use its default registry.

## Error Handling

- `Module not found`: run `stanza search` and use the displayed module id, not the label.
- `missing-peer`, `incompatible-peer`, or `no-adapter`: the selected module does not fit the current stack. Search for alternatives or add required peer slots first.
- `No stanza.json found`: run from a generated Stanza project, not the parent directory.
- Dirty worktree refusal: commit/stash user changes or ask before using `--dangerously-allow-dirty`.
- After adding package-scoped modules such as db/auth/orm, run the selected package manager install command so workspace packages link correctly.

## Agent Rules

- Treat generated files as user-owned project code after Stanza writes them.
- Do not edit `stanza.json` by hand unless the user explicitly asks for manual repair.
- Prefer CLI commands over reconstructing Stanza's template output yourself.
- When reporting results, include the exact command run, whether it wrote files, and any follow-up package-manager command needed.
