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

// All drizzle adapters wire their schema barrel inside the shared db package.
// The auth tables live in `@<project>/auth/auth-schema` (shipped from the
// auth package's own templates) and the orm-owned barrel at
// `packages/db/src/schema.ts` re-exports them so drizzle-kit introspects
// both schemas as one.
const drizzleBarrelExport = [
  {
    id: "re-export",
    args: {
      file: "src/schema.ts",
      from: "{{packageName}}/auth-schema",
      base: "package:db",
    },
  },
] as const;

// Both prisma adapters append the same auth models to the orm-prisma-owned
// `prisma/schema.prisma` inside `packages/db/`. The models match Better
// Auth's canonical Prisma schema (user / session / account / verification);
// the marker wraps the block so re-apply is a no-op and `stanza remove auth`
// cleans it out.
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
      base: "package:db",
    },
  },
] as const;

// Files that go into the auth package itself (`packages/auth/`). The auth
// barrel is shared across every adapter; the auth.ts implementation varies
// by ORM/framework.
const authPackageBarrel = {
  src: "shared/index.ts",
  dest: "src/index.ts",
  scope: "package",
} as const;

const authClientPackage = (src: string) =>
  ({
    src,
    dest: "src/auth-client.ts",
    scope: "package",
  }) as const;

const authImplPackage = (src: string) =>
  ({
    src,
    dest: "src/auth.ts",
    scope: "package",
    template: true,
  }) as const;

const authSchemaPackage = (src: string) =>
  ({
    src,
    dest: "src/auth-schema.ts",
    scope: "package",
  }) as const;

// API route files stay app-scoped (framework routing conventions) but they
// import from the auth package via `{{packageName}}` so the better-auth dep
// lives only in `packages/auth/`.
const nextApiRoute = {
  src: "next/route.ts",
  dest: "app/api/auth/[...all]/route.ts",
  scope: "app",
  template: true,
} as const;

const tanstackApiRoute = {
  src: "tanstack/api.ts",
  dest: "src/routes/api/auth/$.ts",
  scope: "app",
  template: true,
} as const;

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
      peerPackages: ["db"],
      templates: [
        authImplPackage("next/auth.drizzle.ts"),
        authClientPackage("next/auth-client.ts"),
        authSchemaPackage("shared/auth-schema.drizzle-postgres.ts"),
        authPackageBarrel,
        nextApiRoute,
      ],
      codemods: [...drizzleBarrelExport],
    },
    {
      key: "next+drizzle+sqlite",
      match: { framework: "next", orm: "drizzle", db: "sqlite" },
      dependencies: deps,
      env,
      peerPackages: ["db"],
      templates: [
        authImplPackage("next/auth.drizzle.ts"),
        authClientPackage("next/auth-client.ts"),
        authSchemaPackage("shared/auth-schema.drizzle-sqlite.ts"),
        authPackageBarrel,
        nextApiRoute,
      ],
      codemods: [...drizzleBarrelExport],
    },
    {
      key: "next+prisma",
      match: { framework: "next", orm: "prisma" },
      dependencies: deps,
      env,
      peerPackages: ["db"],
      templates: [
        authImplPackage("next/auth.prisma.ts"),
        authClientPackage("next/auth-client.ts"),
        { src: "shared/index.prisma.ts", dest: "src/index.ts", scope: "package" },
        nextApiRoute,
      ],
      codemods: [...prismaAuthModelsAppend],
    },
    {
      key: "tanstack-start+drizzle+postgres",
      match: { framework: "tanstack-start", orm: "drizzle", db: "postgres" },
      dependencies: deps,
      env,
      peerPackages: ["db"],
      templates: [
        authImplPackage("tanstack/auth.drizzle.ts"),
        authClientPackage("tanstack/auth-client.ts"),
        authSchemaPackage("shared/auth-schema.drizzle-postgres.ts"),
        authPackageBarrel,
        tanstackApiRoute,
      ],
      codemods: [...drizzleBarrelExport],
    },
    {
      key: "tanstack-start+drizzle+sqlite",
      match: { framework: "tanstack-start", orm: "drizzle", db: "sqlite" },
      dependencies: deps,
      env,
      peerPackages: ["db"],
      templates: [
        authImplPackage("tanstack/auth.drizzle.ts"),
        authClientPackage("tanstack/auth-client.ts"),
        authSchemaPackage("shared/auth-schema.drizzle-sqlite.ts"),
        authPackageBarrel,
        tanstackApiRoute,
      ],
      codemods: [...drizzleBarrelExport],
    },
    {
      key: "tanstack-start+prisma",
      match: { framework: "tanstack-start", orm: "prisma" },
      dependencies: deps,
      env,
      peerPackages: ["db"],
      templates: [
        authImplPackage("tanstack/auth.prisma.ts"),
        authClientPackage("tanstack/auth-client.ts"),
        { src: "shared/index.prisma.ts", dest: "src/index.ts", scope: "package" },
        tanstackApiRoute,
      ],
      codemods: [...prismaAuthModelsAppend],
    },
  ],
});
