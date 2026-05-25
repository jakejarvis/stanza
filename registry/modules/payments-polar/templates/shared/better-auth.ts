import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";

import { polar as polarClient } from "./polar";

// Pre-configured Polar plugin for Better Auth. Auth.ts adds this to its
// `plugins: [...]` array and the Better Auth catchall (e.g. /api/auth/$)
// auto-mounts /api/auth/polar/* (checkout, portal, webhooks) — no separate
// /api/checkout or /api/webhook/polar routes are needed.
//
// Webhook events arrive at /api/auth/polar/webhooks. Configure that URL in
// the Polar dashboard's webhook settings; the secret must match
// POLAR_WEBHOOK_SECRET.
export const polarPlugin = polar({
  client: polarClient,
  createCustomerOnSignUp: true,
  use: [
    checkout({
      // Map product slugs to Polar product IDs once you have them. Until then,
      // pass `products` directly to the client when calling authClient.checkout().
      products: [],
      successUrl: "/checkout/success?checkoutId={CHECKOUT_ID}",
    }),
    portal(),
    webhooks({
      secret: process.env.POLAR_WEBHOOK_SECRET ?? "",
      // Wire `onOrderPaid`, `onSubscriptionActive`, etc. here as needed.
    }),
  ],
});
