import { stripe } from "{{package.name}}";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const priceId = url.searchParams.get("priceId");
  if (!priceId) {
    return Response.json({ error: "Missing priceId in query params" }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${url.origin}/checkout/success?sessionId={CHECKOUT_SESSION_ID}`,
      cancel_url: `${url.origin}/`,
    });
    if (!session.url) {
      return new Response(null, { status: 500 });
    }
    return Response.redirect(session.url, 303);
  } catch (error) {
    console.error("Failed to create Stripe checkout session:", error);
    return new Response(null, { status: 500 });
  }
}
