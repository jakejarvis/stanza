# Stanza

Modular monorepo template CLI — aka shadcn for full-stack TypeScript projects.

```sh
npm init stanza my-revolutionary-app
```

Pick a framework, ORM, database, auth provider, and UI — get a clean monorepo with idiomatic code, vendored into your repo. Layer in more modules later with `stanza-cli add`.

> [!WARNING]
> **Major work in progress!** See the [module registry](https://stanza.tools/docs/registry) for the roadmap.

## Why Stanza?

- **`add` works after `init`.** Run `stanza add` on an existing project — it's manifest-driven and peer-aware, so it picks the right adapter for your stack and wires deps, env, and templates into the correct workspace package.
- **Your code, vendored.** Generated files land in your repo verbatim. There's no Stanza runtime to install or carry around.
- **Open registry.** Modules are static JSON. Point the CLI at your own host and serve custom modules.

## Quick start

```sh
npm init stanza my-app
cd my-app
npm install
npm run dev
```

Add a module to an existing project at any time:

```sh
npx stanza-cli add auth better-auth
```

`auth`, `db`, and `orm` install into their own internal workspace packages (`packages/auth/`, `packages/db/`, named `@<your-app>/auth`, `@<your-app>/db`); your app consumes them via `workspace:*`. Swapping an auth provider replaces the contents of `packages/auth/` without touching your app's imports.

## Docs

Full guides and the CLI reference live at **[stanza.tools/docs](https://stanza.tools/docs)**. Assemble a stack visually with the builder at **[stanza.tools](https://stanza.tools)**.

## What's inside

```
apps/
  cli/            # stanza-cli — the CLI binary
  web/            # https://stanza.tools (TanStack Start)
packages/
  schema/         # @withstanza/schema — stanza.json + module schema, contract types, category list
  registry/       # slot/peer/capability resolver + package.json/env/template synthesis
  codemods/       # ts-morph helpers for region-aware patching
  utils/          # shared path-safety + env-file helpers
  create-stanza/  # `npm init stanza` template shim
registry/
  modules/        # first-party modules (framework, orm, db, auth, ui, tooling, testing)
scripts/
  compile-registry.ts  # builds the static registry JSON the CLI consumes
```

## License

[MIT](./LICENSE)
