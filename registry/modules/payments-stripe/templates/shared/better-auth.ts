import { stripe as stripePlugin } from "@better-auth/stripe";

import { stripe } from "./stripe";

// Webhook arrives at /api/auth/stripe/webhook; configure that URL in the
// Stripe Dashboard.
export const stripeAuthPlugin = stripePlugin({
  stripeClient: stripe,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  createCustomerOnSignUp: true,
});
