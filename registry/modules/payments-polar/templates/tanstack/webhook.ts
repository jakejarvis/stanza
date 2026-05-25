import { createFileRoute } from "@tanstack/react-router";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";

const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;

// POST /api/webhook/polar — verifies the Polar webhook signature and dispatches.
// Polar retries on non-2xx and timeouts; return 200 fast and enqueue any slow
// work (email, sync, etc.) elsewhere. Dedupe on the `webhook-id` header.
export const Route = createFileRoute("/api/webhook/polar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!webhookSecret) {
          console.error("POLAR_WEBHOOK_SECRET is not set.");
          return new Response(null, { status: 500 });
        }

        const body = await request.text();
        let event: ReturnType<typeof validateEvent>;
        try {
          event = validateEvent(
            body,
            {
              "webhook-id": request.headers.get("webhook-id") ?? "",
              "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
              "webhook-signature": request.headers.get("webhook-signature") ?? "",
            },
            webhookSecret,
          );
        } catch (error) {
          if (error instanceof WebhookVerificationError) {
            return Response.json({ received: false }, { status: 403 });
          }
          throw error;
        }

        switch (event.type) {
          case "order.created":
          case "order.paid":
          case "order.refunded":
            // Fulfill the order, send a receipt, etc.
            break;
          case "subscription.created":
          case "subscription.active":
          case "subscription.canceled":
          case "subscription.revoked":
            // Flip entitlements in your DB.
            break;
          case "customer.created":
          case "customer.updated":
            // Sync customer state.
            break;
        }

        return Response.json({ received: true });
      },
    },
  },
});
