Set `RESEND_API_KEY` in `.env` — grab one from the [Resend dashboard](https://resend.com/api-keys). Verify a sending domain before going live (the `onboarding@resend.dev` sandbox only delivers to your own Resend account email).

Set `RESEND_WEBHOOK_SECRET` to enable delivery-event verification at the framework's `/api/webhook/resend` route. React Email templates live alongside the SDK client in `{{package.name}}`; render them with `render()` and pass to `resend.emails.send`.
