# create-stanza

The canonical entry point to the [Stanza](https://stanza.tools) wizard — `npm create stanza` (and friends) forwards straight to [`stanza-cli`](https://www.npmjs.com/package/stanza-cli)'s `init` command.

```sh
npm create stanza my-app
pnpm create stanza my-app
bun create stanza my-app
```

Pick a framework, ORM, database, auth provider, and UI — get a clean full-stack TypeScript monorepo with idiomatic code vendored into your repo. Pass `--yes` with `--<category>=<id>` flags to skip the prompts in CI.

Everything beyond launching the wizard lives in `stanza-cli`. Full docs at **[stanza.tools/docs](https://stanza.tools/docs)**.

## License

[MIT](https://github.com/jakejarvis/stanza/blob/main/LICENSE)
