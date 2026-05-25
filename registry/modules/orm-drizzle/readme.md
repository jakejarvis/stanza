Schemas live in `{{packages.db.name}}` (`src/schema.ts`). Workflow:

```sh
{{run "db:generate"}}   # generate SQL migrations from schema changes
{{run "db:migrate"}}    # apply pending migrations
{{run "db:studio"}}     # open Drizzle Studio in the browser
```

Import the typed client and table definitions from `{{packages.db.name}}`.
