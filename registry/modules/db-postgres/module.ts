import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "postgres",
  slot: "db",
  label: "PostgreSQL",
  description: "Postgres via the `postgres` driver. Works locally or via Neon/Supabase.",
  version: "0.1.0",
  homepage: "https://www.postgresql.org",
  adapters: [
    {
      key: "default",
      match: {},
      dependencies: { postgres: "^3.4.9" },
      env: [
        {
          name: "DATABASE_URL",
          example: "postgres://postgres:postgres@localhost:5432/stanza",
          required: true,
          description: "Postgres connection string.",
        },
      ],
    },
  ],
});
