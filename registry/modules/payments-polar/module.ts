import { defineModule } from "@stanza/registry";

/**
 * Polar — open-source merchant of record. Subscriptions, one-shot payments,
 * checkout, and webhooks. The SDK is auth-agnostic; the package ships
 * standalone, so `auth` is **not** a required peer.
 *
 * Two integration shapes:
 *  - **Vanilla** (`framework`-only adapters) — the package exports a Polar
 *    SDK client; the app mounts its own `/api/checkout` and
 *    `/api/webhook/polar` route handlers.
 *  - **Bridge** (`+better-auth` adapters) — also exports `polarPlugin`
 *    (pre-wired `@polar-sh/better-auth` plugin). A codemod adds the plugin
 *    to `betterAuth({ plugins: [...] })` in `packages/auth/src/auth.ts`,
 *    and the Better Auth catchall auto-mounts `/api/auth/polar/*` for
 *    checkout / portal / webhooks. No separate route handlers in this mode.
 */
export default defineModule({
  id: "polar",
  category: "payments",
  label: "Polar",
  description: "Merchant of record for subscriptions, checkout, and webhooks.",
  version: "0.1.0",
  peers: { framework: ["next", "tanstack-start"] },
  homepage: "https://polar.sh",
  dependencies: { "@polar-sh/sdk": "^0.47.1" },
  env: [
    {
      name: "POLAR_ACCESS_TOKEN",
      example: "polar_oat_...",
      required: true,
      description: "Polar organization access token (from the dashboard).",
    },
    {
      name: "POLAR_WEBHOOK_SECRET",
      example: "whsec_...",
      required: true,
      description: "Webhook signing secret (set when configuring the webhook endpoint).",
    },
    {
      name: "POLAR_SERVER",
      example: "sandbox",
      required: false,
      description: 'Polar API server: "sandbox" or "production". Defaults to production.',
    },
  ],
  adapters: [
    // Vanilla Next.js: standalone /api/checkout + /api/webhook/polar routes.
    {
      key: "next",
      match: { framework: "next" },
      templates: [
        { src: "shared/polar.ts", dest: "src/polar.ts", scope: "package" },
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        {
          src: "next/checkout.ts",
          dest: "app/api/checkout/route.ts",
          scope: "app",
          template: true,
        },
        { src: "next/webhook.ts", dest: "app/api/webhook/polar/route.ts", scope: "app" },
      ],
    },
    // Vanilla TanStack Start: server routes for checkout + webhook.
    {
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      templates: [
        { src: "shared/polar.ts", dest: "src/polar.ts", scope: "package" },
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        {
          src: "tanstack/checkout.ts",
          dest: "src/routes/api/checkout.ts",
          scope: "app",
          template: true,
        },
        { src: "tanstack/webhook.ts", dest: "src/routes/api/webhook/polar.ts", scope: "app" },
      ],
    },
    // Bridge: Next.js + Better Auth. Plugin is wired into auth.ts; no separate
    // /api/checkout — Better Auth's /api/auth/[...all] catchall serves
    // /api/auth/polar/checkout etc. The `add-plugin-to-call` codemod inserts
    // `polarPlugin` into `betterAuth({ plugins: [...] })`; `add-package-dep`
    // wires the cross-package workspace dep so auth.ts can import from
    // packages/payments.
    {
      key: "next+better-auth",
      match: { framework: "next", auth: "better-auth" },
      dependencies: { "@polar-sh/better-auth": "^1.8.4" },
      templates: [
        { src: "shared/polar.ts", dest: "src/polar.ts", scope: "package" },
        { src: "shared/better-auth.ts", dest: "src/better-auth.ts", scope: "package" },
        { src: "shared/index.better-auth.ts", dest: "src/index.ts", scope: "package" },
      ],
      codemods: [
        {
          id: "add-package-dep",
          args: {
            base: "package:auth",
            name: "{{packages.payments.name}}",
          },
        },
        {
          id: "add-plugin-to-call",
          args: {
            file: "src/auth.ts",
            base: "package:auth",
            callee: "betterAuth",
            property: "plugins",
            call: "polarPlugin",
            imports: [
              {
                from: "{{packages.payments.name}}",
                named: [{ name: "polarPlugin" }],
              },
            ],
          },
        },
      ],
    },
    // Bridge: TanStack Start + Better Auth. Same shape as next+better-auth —
    // only the framework match differs; templates + codemods are identical.
    {
      key: "tanstack-start+better-auth",
      match: { framework: "tanstack-start", auth: "better-auth" },
      dependencies: { "@polar-sh/better-auth": "^1.8.4" },
      templates: [
        { src: "shared/polar.ts", dest: "src/polar.ts", scope: "package" },
        { src: "shared/better-auth.ts", dest: "src/better-auth.ts", scope: "package" },
        { src: "shared/index.better-auth.ts", dest: "src/index.ts", scope: "package" },
      ],
      codemods: [
        {
          id: "add-package-dep",
          args: {
            base: "package:auth",
            name: "{{packages.payments.name}}",
          },
        },
        {
          id: "add-plugin-to-call",
          args: {
            file: "src/auth.ts",
            base: "package:auth",
            callee: "betterAuth",
            property: "plugins",
            call: "polarPlugin",
            imports: [
              {
                from: "{{packages.payments.name}}",
                named: [{ name: "polarPlugin" }],
              },
            ],
          },
        },
      ],
    },
  ],
});
