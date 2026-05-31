import { defineModule } from "@withstanza/schema";

// SDK is auth-agnostic. `+better-auth` adapters additionally wire the
// `@polar-sh/better-auth` plugin into `packages/auth/src/auth.ts` so the
// auth catchall serves `/api/auth/polar/*`.
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
    // Bridge variants ship the standalone /api/checkout (visibility) but skip
    // the standalone webhook — Polar delivers to one URL, and the plugin's
    // handler reconciles with auth customers.
    {
      key: "next+better-auth",
      match: { framework: "next", auth: "better-auth" },
      dependencies: { "@polar-sh/better-auth": "^1.8.4" },
      templates: [
        { src: "shared/polar.ts", dest: "src/polar.ts", scope: "package" },
        { src: "shared/better-auth.ts", dest: "src/better-auth.ts", scope: "package" },
        { src: "shared/index.better-auth.ts", dest: "src/index.ts", scope: "package" },
        {
          src: "next/checkout.ts",
          dest: "app/api/checkout/route.ts",
          scope: "app",
          template: true,
        },
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
    {
      key: "tanstack-start+better-auth",
      match: { framework: "tanstack-start", auth: "better-auth" },
      dependencies: { "@polar-sh/better-auth": "^1.8.4" },
      templates: [
        { src: "shared/polar.ts", dest: "src/polar.ts", scope: "package" },
        { src: "shared/better-auth.ts", dest: "src/better-auth.ts", scope: "package" },
        { src: "shared/index.better-auth.ts", dest: "src/index.ts", scope: "package" },
        {
          src: "tanstack/checkout.ts",
          dest: "src/routes/api/checkout.ts",
          scope: "app",
          template: true,
        },
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
