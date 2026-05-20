import { defineModule } from "@stanza/registry";

/**
 * Clerk ships its own hosted UI and session store; it bypasses the user-owned
 * DB. That means it has no peer requirement on `orm`/`db` — those slots can be
 * unfilled and Clerk still works. Only the Next.js adapter is wired up so
 * far; TanStack Start integration is planned.
 */
export default defineModule({
  id: "clerk",
  slot: "auth",
  label: "Clerk",
  description: "Hosted user management with pre-built UI components.",
  version: "0.1.0",
  peers: { framework: ["next"] },
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
        { src: "middleware.ts", dest: "middleware.ts", scope: "app" },
        { src: "layout-wrapper.tsx", dest: "app/_clerk-provider.tsx", scope: "app" },
      ],
    },
  ],
});
