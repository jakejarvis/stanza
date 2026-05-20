import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "better-auth",
  slot: "auth",
  label: "Better Auth",
  description: "Framework-agnostic, headless TypeScript auth library.",
  version: "0.1.0",
  peers: { orm: ["drizzle", "prisma"], framework: ["next", "tanstack-start"] },
  homepage: "https://better-auth.com",
  adapters: [
    {
      key: "next+drizzle",
      match: { framework: "next", orm: "drizzle" },
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
          description: "Public URL of the app.",
        },
      ],
      templates: [
        { src: "next/auth.drizzle.ts", dest: "src/lib/auth.ts", scope: "app" },
        { src: "next/auth-client.ts", dest: "src/lib/auth-client.ts", scope: "app" },
        { src: "next/route.ts", dest: "app/api/auth/[...all]/route.ts", scope: "app" },
        { src: "shared/auth-schema.drizzle.ts", dest: "src/db/auth-schema.ts", scope: "app" },
      ],
    },
    {
      key: "next+prisma",
      match: { framework: "next", orm: "prisma" },
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
          description: "Public URL of the app.",
        },
      ],
      templates: [
        { src: "next/auth.prisma.ts", dest: "src/lib/auth.ts", scope: "app" },
        { src: "next/auth-client.ts", dest: "src/lib/auth-client.ts", scope: "app" },
        { src: "next/route.ts", dest: "app/api/auth/[...all]/route.ts", scope: "app" },
      ],
    },
    {
      key: "tanstack-start+drizzle",
      match: { framework: "tanstack-start", orm: "drizzle" },
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
          description: "Public URL of the app.",
        },
      ],
      templates: [
        { src: "tanstack/auth.drizzle.ts", dest: "src/lib/auth.ts", scope: "app" },
        { src: "tanstack/auth-client.ts", dest: "src/lib/auth-client.ts", scope: "app" },
        { src: "tanstack/api.ts", dest: "src/routes/api/auth/$.ts", scope: "app" },
        { src: "shared/auth-schema.drizzle.ts", dest: "src/db/auth-schema.ts", scope: "app" },
      ],
    },
    {
      key: "tanstack-start+prisma",
      match: { framework: "tanstack-start", orm: "prisma" },
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
          description: "Public URL of the app.",
        },
      ],
      templates: [
        { src: "tanstack/auth.prisma.ts", dest: "src/lib/auth.ts", scope: "app" },
        { src: "tanstack/auth-client.ts", dest: "src/lib/auth-client.ts", scope: "app" },
        { src: "tanstack/api.ts", dest: "src/routes/api/auth/$.ts", scope: "app" },
      ],
    },
  ],
});
