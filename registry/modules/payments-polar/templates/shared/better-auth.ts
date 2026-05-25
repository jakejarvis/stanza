import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";

import { polar as polarClient } from "./polar";

export const polarPlugin = polar({
  client: polarClient,
  createCustomerOnSignUp: true,
  use: [
    checkout({
      products: [],
      successUrl: "/checkout/success?checkoutId={CHECKOUT_ID}",
    }),
    portal(),
    webhooks({
      secret: process.env.POLAR_WEBHOOK_SECRET ?? "",
    }),
  ],
});
