Generate a signing secret and set the two required env vars in `.env`:

```sh
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" >> .env
echo "BETTER_AUTH_URL=http://localhost:3000" >> .env
```

The configured auth instance is exported from `{{package.name}}`{{#if (eq peers.orm "drizzle")}} and its schema is wired into `{{packages.db.name}}` via `src/schema.ts`. Push the auth tables to your database with `{{run "db:push"}}`{{/if}}{{#if (eq peers.orm "prisma")}} and its models are added to the shared Prisma schema. Run `{{run "db:push"}}` to apply them{{/if}}.
