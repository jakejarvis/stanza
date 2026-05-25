import type Stripe from "stripe";

import { stripe } from "{{package.name}}";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request): Promise<Response> {
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set.");
    return new Response(null, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      // Fulfill the order, send a receipt, etc.
      break;
    case "invoice.paid":
    case "invoice.payment_failed":
      // Reconcile subscription invoices.
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // Flip entitlements in your DB.
      break;
  }

  return Response.json({ received: true });
}
