End-to-end browser tests with [Playwright](https://playwright.dev):

```sh
npx playwright install   # one-time: download browser binaries
{{run "test:e2e"}}        # run the suite headless
{{run "test:e2e:ui"}}     # interactive UI mode for debugging
```

Specs live in `{{app.dir}}/tests/` — Playwright auto-starts your dev server (see `playwright.config.ts`).
