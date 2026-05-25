import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY is not set. See .env.example.");
}

// Pin the API version so SDK upgrades don't silently change behavior — bump it
// here in lockstep with the dashboard's "Workbench → API version" pin.
export const stripe = new Stripe(secretKey, {
  apiVersion: "2026-04-22.dahlia",
});
