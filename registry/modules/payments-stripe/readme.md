Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env` — find them in the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys).

To receive webhooks locally, forward events with the Stripe CLI:

```sh
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Checkout sessions and the customer portal are exposed from `{{package.name}}`.
