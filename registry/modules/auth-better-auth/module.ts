import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "better-auth",
  category: "auth",
  label: "Better Auth",
  description: "Framework-agnostic, headless TypeScript auth library.",
  version: "0.1.0",
  peers: {
    orm: ["drizzle", "prisma"],
    framework: ["next", "tanstack-start"],
    db: ["postgres", "sqlite"],
  },
  homepage: "https://better-auth.com",
  dependencies: { "better-auth": "^1.6.11" },
  env: [
    {
      name: "BETTER_AUTH_SECRET",
      example: "change-me-in-prod",
      required: true,
      description: "Better Auth signing secret.",
    },
    {
      name: "BETTER_AUTH_URL",
      example: "http://localhost:3000",
      required: true,
      description: "Public URL of the app (used server-side for callbacks and cookies).",
    },
  ],
  consumesPackages: ["db"],
  adapters: [
    {
      key: "next+drizzle+postgres",
      match: { framework: "next", orm: "drizzle", db: "postgres" },
      templates: [
        {
          src: "next/auth.drizzle.postgres.ts",
          dest: "src/auth.ts",
          scope: "package",
          template: true,
        },
        { src: "next/auth-client.ts", dest: "src/auth-client.ts", scope: "package" },
        {
          src: "shared/auth-schema.drizzle-postgres.ts",
          dest: "src/auth-schema.ts",
          scope: "package",
        },
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        {
          src: "next/route.ts",
          dest: "app/api/auth/[...all]/route.ts",
          scope: "app",
          template: true,
        },
      ],
      codemods: [
        {
          id: "re-export",
          args: { file: "src/schema.ts", from: "{{packageName}}/auth-schema", base: "package:db" },
        },
      ],
    },
    {
      key: "next+drizzle+sqlite",
      match: { framework: "next", orm: "drizzle", db: "sqlite" },
      templates: [
        {
          src: "next/auth.drizzle.sqlite.ts",
          dest: "src/auth.ts",
          scope: "package",
          template: true,
        },
        { src: "next/auth-client.ts", dest: "src/auth-client.ts", scope: "package" },
        {
          src: "shared/auth-schema.drizzle-sqlite.ts",
          dest: "src/auth-schema.ts",
          scope: "package",
        },
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        {
          src: "next/route.ts",
          dest: "app/api/auth/[...all]/route.ts",
          scope: "app",
          template: true,
        },
      ],
      codemods: [
        {
          id: "re-export",
          args: { file: "src/schema.ts", from: "{{packageName}}/auth-schema", base: "package:db" },
        },
      ],
    },
    {
      key: "next+prisma",
      match: { framework: "next", orm: "prisma" },
      templates: [
        { src: "next/auth.prisma.ts", dest: "src/auth.ts", scope: "package", template: true },
        { src: "next/auth-client.ts", dest: "src/auth-client.ts", scope: "package" },
        { src: "shared/index.prisma.ts", dest: "src/index.ts", scope: "package" },
        {
          src: "next/route.ts",
          dest: "app/api/auth/[...all]/route.ts",
          scope: "app",
          template: true,
        },
      ],
      codemods: [
        {
          id: "append-to-file",
          args: {
            file: "prisma/schema.prisma",
            content: `model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]

  @@map("user")
}

model Session {
  id        String   @id
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  token     String
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("session")
}

model Account {
  id                    String    @id
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accountId             String
  providerId            String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("verification")
}`,
            marker: "better-auth-models",
            base: "package:db",
          },
        },
      ],
    },
    {
      key: "tanstack-start+drizzle+postgres",
      match: { framework: "tanstack-start", orm: "drizzle", db: "postgres" },
      templates: [
        {
          src: "tanstack/auth.drizzle.postgres.ts",
          dest: "src/auth.ts",
          scope: "package",
          template: true,
        },
        { src: "tanstack/auth-client.ts", dest: "src/auth-client.ts", scope: "package" },
        {
          src: "shared/auth-schema.drizzle-postgres.ts",
          dest: "src/auth-schema.ts",
          scope: "package",
        },
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        { src: "tanstack/api.ts", dest: "src/routes/api/auth/$.ts", scope: "app", template: true },
      ],
      codemods: [
        {
          id: "re-export",
          args: { file: "src/schema.ts", from: "{{packageName}}/auth-schema", base: "package:db" },
        },
      ],
    },
    {
      key: "tanstack-start+drizzle+sqlite",
      match: { framework: "tanstack-start", orm: "drizzle", db: "sqlite" },
      templates: [
        {
          src: "tanstack/auth.drizzle.sqlite.ts",
          dest: "src/auth.ts",
          scope: "package",
          template: true,
        },
        { src: "tanstack/auth-client.ts", dest: "src/auth-client.ts", scope: "package" },
        {
          src: "shared/auth-schema.drizzle-sqlite.ts",
          dest: "src/auth-schema.ts",
          scope: "package",
        },
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        { src: "tanstack/api.ts", dest: "src/routes/api/auth/$.ts", scope: "app", template: true },
      ],
      codemods: [
        {
          id: "re-export",
          args: { file: "src/schema.ts", from: "{{packageName}}/auth-schema", base: "package:db" },
        },
      ],
    },
    {
      key: "tanstack-start+prisma",
      match: { framework: "tanstack-start", orm: "prisma" },
      templates: [
        { src: "tanstack/auth.prisma.ts", dest: "src/auth.ts", scope: "package", template: true },
        { src: "tanstack/auth-client.ts", dest: "src/auth-client.ts", scope: "package" },
        { src: "shared/index.prisma.ts", dest: "src/index.ts", scope: "package" },
        { src: "tanstack/api.ts", dest: "src/routes/api/auth/$.ts", scope: "app", template: true },
      ],
      codemods: [
        {
          id: "append-to-file",
          args: {
            file: "prisma/schema.prisma",
            content: `model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]

  @@map("user")
}

model Session {
  id        String   @id
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  token     String
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("session")
}

model Account {
  id                    String    @id
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accountId             String
  providerId            String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("verification")
}`,
            marker: "better-auth-models",
            base: "package:db",
          },
        },
      ],
    },
  ],
});
