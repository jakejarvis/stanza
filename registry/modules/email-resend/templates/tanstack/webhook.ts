import { createFileRoute } from "@tanstack/react-router";

import { resend } from "{{package.name}}";

const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

export const Route = createFileRoute("/api/webhook/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!webhookSecret) {
          console.error("RESEND_WEBHOOK_SECRET is not set.");
          return new Response(null, { status: 500 });
        }

        // Resend signs with Svix — verify against the raw body, not JSON.
        const payload = await request.text();

        let event: Awaited<ReturnType<typeof resend.webhooks.verify>>;
        try {
          event = resend.webhooks.verify({
            payload,
            headers: {
              "svix-id": request.headers.get("svix-id") ?? "",
              "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
              "svix-signature": request.headers.get("svix-signature") ?? "",
            },
            secret: webhookSecret,
          });
        } catch (error) {
          console.error("Resend webhook signature verification failed:", error);
          return Response.json({ error: "Invalid signature" }, { status: 400 });
        }

        switch (event.type) {
          case "email.sent":
          case "email.delivered":
            // Mark the message as sent / delivered in your DB.
            break;
          case "email.bounced":
          case "email.complained":
            // Suppress the recipient or notify the sender.
            break;
          case "email.opened":
          case "email.clicked":
            // Engagement signals.
            break;
        }

        return Response.json({ received: true });
      },
    },
  },
});
