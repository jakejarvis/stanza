import { defineModule } from "@stanza/registry";

// SDK is auth-agnostic. `+better-auth` adapters additionally wire the
// `@better-auth/stripe` plugin into `packages/auth/src/auth.ts` so the auth
// catchall serves `/api/auth/stripe/*`.
export default defineModule({
  id: "stripe",
  category: "payments",
  label: "Stripe",
  description: "Payments, subscriptions, and webhooks via the Stripe API.",
  version: "0.1.0",
  peers: { framework: ["next", "tanstack-start"] },
  homepage: "https://stripe.com",
  dependencies: { stripe: "^22.1.1" },
  env: [
    {
      name: "STRIPE_SECRET_KEY",
      example: "sk_test_...",
      required: true,
      description: "Stripe secret key (prefer a restricted API key — `rk_test_…` / `rk_live_…`).",
    },
    {
      name: "STRIPE_WEBHOOK_SECRET",
      example: "whsec_...",
      required: true,
      description:
        "Webhook signing secret (Dashboard → Workbench → Webhooks; from `stripe listen` locally).",
    },
  ],
  adapters: [
    {
      key: "next",
      match: { framework: "next" },
      templates: [
        { src: "shared/stripe.ts", dest: "src/stripe.ts", scope: "package" },
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        {
          src: "next/checkout.ts",
          dest: "app/api/checkout/route.ts",
          scope: "app",
          template: true,
        },
        {
          src: "next/webhook.ts",
          dest: "app/api/webhook/stripe/route.ts",
          scope: "app",
          template: true,
        },
      ],
    },
    {
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      templates: [
        { src: "shared/stripe.ts", dest: "src/stripe.ts", scope: "package" },
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        {
          src: "tanstack/checkout.ts",
          dest: "src/routes/api/checkout.ts",
          scope: "app",
          template: true,
        },
        {
          src: "tanstack/webhook.ts",
          dest: "src/routes/api/webhook/stripe.ts",
          scope: "app",
          template: true,
        },
      ],
    },
    // Bridge variants ship the standalone /api/checkout (visibility) but skip
    // the standalone webhook — Stripe delivers to one URL, and the plugin's
    // handler reconciles with auth customers.
    {
      key: "next+better-auth",
      match: { framework: "next", auth: "better-auth" },
      dependencies: { "@better-auth/stripe": "^1.6.11" },
      templates: [
        { src: "shared/stripe.ts", dest: "src/stripe.ts", scope: "package" },
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
            call: "stripeAuthPlugin",
            imports: [
              {
                from: "{{packages.payments.name}}",
                named: [{ name: "stripeAuthPlugin" }],
              },
            ],
          },
        },
      ],
    },
    {
      key: "tanstack-start+better-auth",
      match: { framework: "tanstack-start", auth: "better-auth" },
      dependencies: { "@better-auth/stripe": "^1.6.11" },
      templates: [
        { src: "shared/stripe.ts", dest: "src/stripe.ts", scope: "package" },
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
            call: "stripeAuthPlugin",
            imports: [
              {
                from: "{{packages.payments.name}}",
                named: [{ name: "stripeAuthPlugin" }],
              },
            ],
          },
        },
      ],
    },
  ],
});
