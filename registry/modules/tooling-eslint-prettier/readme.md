Standard JS/TS lint + formatter pairing — [ESLint](https://eslint.org) (flat config) for code rules, [Prettier](https://prettier.io) for formatting:

```sh
{{run "lint"}}     # check for lint errors
{{run "format"}}   # rewrite files with Prettier
```

Config lives at `eslint.config.mjs` and `.prettierrc.json` at the repo root.
