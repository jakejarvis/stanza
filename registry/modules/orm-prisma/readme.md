Models live in `{{packages.db.name}}/prisma/schema.prisma`. Workflow:

```sh
{{run "db:generate"}}   # regenerate the Prisma Client after schema edits
{{run "db:migrate"}}    # create + apply a new migration
{{run "db:studio"}}     # open Prisma Studio in the browser
```

Import the generated `PrismaClient` from `{{packages.db.name}}`.
