Run unit and integration tests with [Vitest](https://vitest.dev):

```sh
{{run "test"}}        # run once
{{run "test:watch"}}  # re-run on file changes
```

Tests live next to the code they cover (`*.test.ts`/`*.test.tsx`) or in `{{app.dir}}/tests/`.
