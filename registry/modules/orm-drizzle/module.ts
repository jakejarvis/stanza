import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "drizzle",
  slot: "orm",
  label: "Drizzle",
  description: "TypeScript-first ORM with schema-as-code and zero runtime overhead.",
  version: "0.1.0",
  peers: { db: ["postgres", "sqlite"] },
  homepage: "https://orm.drizzle.team",
  adapters: [
    {
      key: "postgres",
      match: { db: "postgres" },
      dependencies: { "drizzle-orm": "^0.45.2" },
      devDependencies: { "drizzle-kit": "^0.31.10" },
      scripts: {
        "db:generate": "drizzle-kit generate",
        "db:migrate": "drizzle-kit migrate",
        "db:studio": "drizzle-kit studio",
      },
      templates: [
        { src: "drizzle.config.postgres.ts", dest: "drizzle.config.ts", scope: "app" },
        { src: "src/db/index.postgres.ts", dest: "src/db/index.ts", scope: "app" },
        { src: "src/db/schema.postgres.ts", dest: "src/db/schema.ts", scope: "app" },
      ],
    },
    {
      key: "sqlite",
      match: { db: "sqlite" },
      dependencies: { "drizzle-orm": "^0.45.2" },
      devDependencies: { "drizzle-kit": "^0.31.10" },
      scripts: {
        "db:generate": "drizzle-kit generate",
        "db:migrate": "drizzle-kit migrate",
        "db:studio": "drizzle-kit studio",
      },
      templates: [
        { src: "drizzle.config.sqlite.ts", dest: "drizzle.config.ts", scope: "app" },
        { src: "src/db/index.sqlite.ts", dest: "src/db/index.ts", scope: "app" },
        { src: "src/db/schema.sqlite.ts", dest: "src/db/schema.ts", scope: "app" },
      ],
    },
  ],
});
