import { defineModule } from "@stanza/registry";

/**
 * Clerk ships its own hosted UI and session store; it bypasses the user-owned
 * DB. That means it has no peer requirement on `orm`/`db` — those slots can be
 * unfilled and Clerk still works. Currently wires up Next.js and TanStack Start.
 */
export default defineModule({
  id: "clerk",
  category: "auth",
  label: "Clerk",
  description: "Hosted user management with pre-built UI components.",
  version: "0.1.0",
  peers: { framework: ["next", "tanstack-start"] },
  homepage: "https://clerk.com",
  adapters: [
    {
      key: "next",
      match: { framework: "next" },
      dependencies: { "@clerk/nextjs": "^7.3.7" },
      env: [
        {
          name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
          example: "pk_test_...",
          required: true,
          description: "Clerk publishable key.",
        },
        {
          name: "CLERK_SECRET_KEY",
          example: "sk_test_...",
          required: true,
          description: "Clerk secret key.",
        },
      ],
      templates: [
        // Package-scoped: provider + barrel land in packages/auth/.
        { src: "next/provider.tsx", dest: "src/provider.tsx", scope: "package" },
        { src: "next/index.ts", dest: "src/index.ts", scope: "package" },
        // App-scoped: Next requires middleware.ts at the app root. We ship a
        // thin shim that re-exports clerkMiddleware from the auth package, so
        // the @clerk/nextjs dep stays in packages/auth/.
        { src: "next/middleware.ts", dest: "middleware.ts", scope: "app", template: true },
      ],
      codemods: [
        {
          id: "wrap-root-layout",
          args: {
            providerName: "ClerkRootProvider",
            providerImport: "{{package.name}}",
          },
        },
      ],
    },
    {
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      dependencies: { "@clerk/tanstack-react-start": "^1.3.1" },
      env: [
        {
          name: "CLERK_PUBLISHABLE_KEY",
          example: "pk_test_...",
          required: true,
          description: "Clerk publishable key.",
        },
        {
          name: "CLERK_SECRET_KEY",
          example: "sk_test_...",
          required: true,
          description: "Clerk secret key.",
        },
      ],
      templates: [
        // Package-scoped: provider + barrel land in packages/auth/.
        { src: "tanstack/provider.tsx", dest: "src/provider.tsx", scope: "package" },
        { src: "tanstack/index.ts", dest: "src/index.ts", scope: "package" },
        // App-scoped: TanStack Start auto-discovers src/start.ts for the
        // createStart() entry point. A thin shim re-exports clerkMiddleware
        // from the auth package so the @clerk/tanstack-react-start dep stays
        // in packages/auth/.
        { src: "tanstack/start.ts", dest: "src/start.ts", scope: "app", template: true },
      ],
      codemods: [
        {
          id: "wrap-root-layout",
          args: {
            providerName: "ClerkRootProvider",
            providerImport: "{{package.name}}",
          },
        },
      ],
    },
  ],
});
