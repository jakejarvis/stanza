import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "prisma",
  slot: "orm",
  label: "Prisma",
  description: "Type-safe ORM with migrations, studio, and broad DB support.",
  version: "0.1.0",
  peers: { db: ["postgres", "sqlite"] },
  homepage: "https://www.prisma.io",
  adapters: [
    {
      key: "postgres",
      match: { db: "postgres" },
      dependencies: { "@prisma/client": "^7.8.0" },
      devDependencies: { prisma: "^7.8.0" },
      scripts: {
        "db:generate": "prisma generate",
        "db:migrate": "prisma migrate dev",
        "db:studio": "prisma studio",
      },
      templates: [
        { src: "prisma/schema.postgres.prisma", dest: "prisma/schema.prisma", scope: "app" },
        { src: "src/db.ts", dest: "src/db.ts", scope: "app" },
      ],
    },
    {
      key: "sqlite",
      match: { db: "sqlite" },
      dependencies: { "@prisma/client": "^7.8.0" },
      devDependencies: { prisma: "^7.8.0" },
      scripts: {
        "db:generate": "prisma generate",
        "db:migrate": "prisma migrate dev",
        "db:studio": "prisma studio",
      },
      templates: [
        { src: "prisma/schema.sqlite.prisma", dest: "prisma/schema.prisma", scope: "app" },
        { src: "src/db.ts", dest: "src/db.ts", scope: "app" },
      ],
    },
  ],
});
