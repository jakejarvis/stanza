import { createFileRoute } from "@tanstack/react-router";

import { polar } from "{{package.name}}";

// GET /api/checkout?products=<product_id>[&products=<product_id>...]
// Creates a Polar checkout session and 302-redirects to the hosted checkout
// page. Polar substitutes `{CHECKOUT_ID}` in `successUrl` at redirect time.
export const Route = createFileRoute("/api/checkout")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const products = url.searchParams.getAll("products");
        if (products.length === 0) {
          return Response.json({ error: "Missing products in query params" }, { status: 400 });
        }

        try {
          const session = await polar.checkouts.create({
            products,
            successUrl: `${url.origin}/checkout/success?checkoutId={CHECKOUT_ID}`,
          });
          return Response.redirect(session.url, 302);
        } catch (error) {
          console.error("Failed to create Polar checkout:", error);
          return new Response(null, { status: 500 });
        }
      },
    },
  },
});
