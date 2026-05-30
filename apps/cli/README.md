# stanza-cli

Modular monorepo template CLI — shadcn for full-stack TypeScript stacks.

Pick a framework, ORM, database, auth provider, UI, and more — get a clean monorepo with idiomatic code **vendored into your repo**. There's no runtime to install: generated files land verbatim and are yours to edit. Unlike a one-shot scaffolder, `stanza add` keeps working after `init`, so you can layer modules into an existing project at any time.

> [!WARNING]
> **Major work in progress!** See the [module registry](https://stanza.tools/docs/registry) for what's available today and what's on the roadmap.

## Quick start

```sh
npm create stanza my-app   # → runs the init wizard (see create-stanza)
cd my-app
npm install
npm run dev
```

Or drive the CLI directly:

```sh
npx stanza-cli init my-app          # interactive wizard
npx stanza-cli add auth better-auth # add a module to an existing project
```

Non-interactive (CI / agents) — pass each category explicitly:

```sh
npx stanza-cli init my-app --yes \
  --framework=next --ui=tailwind \
  --db=postgres --orm=drizzle \
  --auth=better-auth --testing=vitest,playwright --pm=pnpm
```

## Commands

| Command                                   | What it does                                                                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stanza init [name]`                      | Scaffold a new monorepo via the wizard (or `--yes` + `--<category>=<id>` flags).                                                                                                                   |
| `stanza add <category> [@<ns>/]<module>`  | Add one module to an existing project; picks the right adapter for your stack and wires deps, env, scripts, and templates into the correct workspace package. `--app=<id>` targets a specific app. |
| `stanza remove <category> [[@<ns>/]<id>]` | Remove a module and clean up its files, deps, and codemods. The id is optional for single-choice categories.                                                                                       |
| `stanza list`                             | Print installed modules grouped by category.                                                                                                                                                       |
| `stanza search [query]`                   | List registry modules and their `category/id` pairs.                                                                                                                                               |
| `stanza doctor`                           | Check `stanza.json` against the filesystem for drift (read-only); exits non-zero when something's missing.                                                                                         |

Run `add` / `remove` / `list` / `doctor` from the project root or any child directory under a `stanza.json`.

Every module fills exactly one **category**. Single-choice categories (`framework`, `ui`, `db`, `orm`, `auth`, `payments`, `email`, `ai`, `tooling`, `monorepo`) hold one module; multi-choice (`testing`, `deploy`) coexist. `auth`/`db`/`orm` and friends install into their own internal workspace packages (`packages/auth/`, `packages/db/`, …); your apps consume them via `workspace:*`, so swapping a provider replaces a package's contents without touching your app imports.

## Safety

- `--dry-run` previews any mutating command without writing.
- Mutating commands refuse to run in a dirty git worktree so Stanza's edits stay in their own reviewable diff. Override with `--dangerously-allow-dirty`.
- Declared `^`/`~` dep ranges are bumped to the latest satisfying npm version (modifier kept); `workspace:*` and other ranges are written as-is. `STANZA_NO_NPM_LOOKUP=1` skips lookups; `STANZA_NPM_REGISTRY=<url>` overrides the npm registry.

## Registries

Modules ship from the first-party `@stanza` namespace by default. To pull from another publisher, declare it in `stanza.json` and address modules as `@<scope>/<id>`:

```jsonc
// the full URL to the registry's main JSON file (the index)
{ "registries": { "@acme": "https://reg.acme.dev/registry.json" } }
```

```sh
stanza add testing @acme/cosmos
```

`STANZA_REGISTRY=<url-or-path>` overrides the `@stanza` namespace's source — the full URL or filesystem path to a registry's main JSON file (self-hosted mirror, air-gapped install, CI fixture).

## Telemetry

The CLI sends anonymous usage events (command run, modules installed/removed — no PII, no persisted identifier; third-party module ids are redacted). Disable per-run with `--no-telemetry`, or persistently with `STANZA_TELEMETRY=0` / `DO_NOT_TRACK=1`. Auto-skipped in CI.

## Docs

Full guides, the CLI reference, and the module roadmap live at **[stanza.tools/docs](https://stanza.tools/docs)**. Assemble a stack visually at **[stanza.tools](https://stanza.tools)**.

## License

[MIT](https://github.com/jakejarvis/stanza/blob/main/LICENSE)
