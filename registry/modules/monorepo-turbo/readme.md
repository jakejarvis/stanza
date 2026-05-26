Workspace task orchestration via [Turborepo](https://turborepo.dev). Root scripts fan out across packages with content-addressed caching:

```sh
{{run "build"}}    # turbo run build  (cached, parallel)
{{run "dev"}}      # turbo run dev    (persistent, uncached)
{{run "test"}}     # turbo run test
{{run "lint"}}     # turbo run lint
```

Config lives at `turbo.json` at the repo root.
