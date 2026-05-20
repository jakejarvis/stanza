import { defineModule } from "@stanza/registry";

// Shared env declaration — every adapter wants the same two vars.
const env = [
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
];

const deps = { "better-auth": "^1.6.11" };

// All four drizzle adapters share the same barrel-re-export step — the auth
// tables ship as `src/db/auth-schema.ts` and need to be visible through the
// existing Drizzle barrel at `src/db/schema.ts` for drizzle-kit to see them.
const drizzleBarrelExport = [
  {
    id: "re-export",
    args: { file: "src/db/schema.ts", from: "./auth-schema" },
  },
] as const;

// Both prisma adapters append the same auth models to the orm-prisma-owned
// `prisma/schema.prisma`. The models match Better Auth's canonical Prisma
// schema (user / session / account / verification); the marker wraps the
// block so re-apply is a no-op and `stanza remove auth` cleans it out.
const prismaAuthModels = `model User {
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
}`;

const prismaAuthModelsAppend = [
  {
    id: "append-to-file",
    args: {
      file: "prisma/schema.prisma",
      content: prismaAuthModels,
      marker: "better-auth-models",
    },
  },
] as const;

export default defineModule({
  id: "better-auth",
  slot: "auth",
  label: "Better Auth",
  description: "Framework-agnostic, headless TypeScript auth library.",
  version: "0.1.0",
  peers: {
    orm: ["drizzle", "prisma"],
    framework: ["next", "tanstack-start"],
    db: ["postgres", "sqlite"],
  },
  homepage: "https://better-auth.com",
  adapters: [
    {
      key: "next+drizzle+postgres",
      match: { framework: "next", orm: "drizzle", db: "postgres" },
      dependencies: deps,
      env,
      templates: [
        { src: "next/auth.drizzle.ts", dest: "src/lib/auth.ts", scope: "app" },
        { src: "next/auth-client.ts", dest: "src/lib/auth-client.ts", scope: "app" },
        { src: "next/route.ts", dest: "app/api/auth/[...all]/route.ts", scope: "app" },
        {
          src: "shared/auth-schema.drizzle-postgres.ts",
          dest: "src/db/auth-schema.ts",
          scope: "app",
        },
      ],
      codemods: [...drizzleBarrelExport],
    },
    {
      key: "next+drizzle+sqlite",
      match: { framework: "next", orm: "drizzle", db: "sqlite" },
      dependencies: deps,
      env,
      templates: [
        { src: "next/auth.drizzle.ts", dest: "src/lib/auth.ts", scope: "app" },
        { src: "next/auth-client.ts", dest: "src/lib/auth-client.ts", scope: "app" },
        { src: "next/route.ts", dest: "app/api/auth/[...all]/route.ts", scope: "app" },
        {
          src: "shared/auth-schema.drizzle-sqlite.ts",
          dest: "src/db/auth-schema.ts",
          scope: "app",
        },
      ],
      codemods: [...drizzleBarrelExport],
    },
    {
      key: "next+prisma",
      match: { framework: "next", orm: "prisma" },
      dependencies: deps,
      env,
      templates: [
        { src: "next/auth.prisma.ts", dest: "src/lib/auth.ts", scope: "app" },
        { src: "next/auth-client.ts", dest: "src/lib/auth-client.ts", scope: "app" },
        { src: "next/route.ts", dest: "app/api/auth/[...all]/route.ts", scope: "app" },
      ],
      codemods: [...prismaAuthModelsAppend],
    },
    {
      key: "tanstack-start+drizzle+postgres",
      match: { framework: "tanstack-start", orm: "drizzle", db: "postgres" },
      dependencies: deps,
      env,
      templates: [
        { src: "tanstack/auth.drizzle.ts", dest: "src/lib/auth.ts", scope: "app" },
        { src: "tanstack/auth-client.ts", dest: "src/lib/auth-client.ts", scope: "app" },
        { src: "tanstack/api.ts", dest: "src/routes/api/auth/$.ts", scope: "app" },
        {
          src: "shared/auth-schema.drizzle-postgres.ts",
          dest: "src/db/auth-schema.ts",
          scope: "app",
        },
      ],
      codemods: [...drizzleBarrelExport],
    },
    {
      key: "tanstack-start+drizzle+sqlite",
      match: { framework: "tanstack-start", orm: "drizzle", db: "sqlite" },
      dependencies: deps,
      env,
      templates: [
        { src: "tanstack/auth.drizzle.ts", dest: "src/lib/auth.ts", scope: "app" },
        { src: "tanstack/auth-client.ts", dest: "src/lib/auth-client.ts", scope: "app" },
        { src: "tanstack/api.ts", dest: "src/routes/api/auth/$.ts", scope: "app" },
        {
          src: "shared/auth-schema.drizzle-sqlite.ts",
          dest: "src/db/auth-schema.ts",
          scope: "app",
        },
      ],
      codemods: [...drizzleBarrelExport],
    },
    {
      key: "tanstack-start+prisma",
      match: { framework: "tanstack-start", orm: "prisma" },
      dependencies: deps,
      env,
      templates: [
        { src: "tanstack/auth.prisma.ts", dest: "src/lib/auth.ts", scope: "app" },
        { src: "tanstack/auth-client.ts", dest: "src/lib/auth-client.ts", scope: "app" },
        { src: "tanstack/api.ts", dest: "src/routes/api/auth/$.ts", scope: "app" },
      ],
      codemods: [...prismaAuthModelsAppend],
    },
  ],
});
