import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "sqlite",
  category: "db",
  label: "SQLite",
  description: "Local SQLite via better-sqlite3. Zero-config for development.",
  version: "0.1.0",
  homepage: "https://www.sqlite.org",
  adapters: [
    {
      key: "default",
      match: {},
      dependencies: { "better-sqlite3": "^12.10.0" },
      devDependencies: { "@types/better-sqlite3": "^7.6.13" },
      env: [
        {
          name: "DATABASE_URL",
          example: "file:./data/dev.db",
          required: true,
          description: "SQLite database file path.",
        },
      ],
    },
  ],
});
