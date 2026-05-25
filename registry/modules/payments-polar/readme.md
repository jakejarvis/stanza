Set `POLAR_ACCESS_TOKEN` and `POLAR_WEBHOOK_SECRET` in `.env` — create them in your [Polar dashboard](https://polar.sh/dashboard) (use the sandbox at <https://sandbox.polar.sh> for development).

To receive webhooks locally, expose your dev server with `ngrok http 3000` and point a Polar webhook at `https://<your-tunnel>/api/polar/webhook`. Checkout and the customer portal are exposed from `{{package.name}}`.
