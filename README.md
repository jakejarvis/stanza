# Stanza

Modular monorepo template CLI — shadcn for full-stack TypeScript stacks.

```sh
pnpm create stanza my-app
```

Pick a framework, ORM, database, auth provider, styling — get a clean monorepo with idiomatic code, vendored into your repo. Add modules later with `stanza add`.

## What's inside

```
apps/
  cli/          # @stanza/cli — the CLI binary
  web/          # builder.stanza.dev (TanStack Start)
packages/
  registry/     # shared schema, slot/peer/capability resolver
  codemods/     # ts-morph helpers for region-aware patching
  create-stanza/  # `pnpm create stanza` shim
registry/
  modules/      # first-party modules (framework, orm, db, auth, styling)
```

## Status

Work in progress. See [CLAUDE.md](./CLAUDE.md), [TODO.md](./TODO.md), and [REGISTRY.md](./REGISTRY.md) for current state.

## License

MIT — see [LICENSE](./LICENSE).
