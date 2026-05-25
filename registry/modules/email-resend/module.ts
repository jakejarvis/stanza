import { defineModule } from "@stanza/registry";

// Ships the Resend SDK client + a sample React Email template alongside it in
// `packages/email/`. Per-framework adapters add the delivery-event webhook
// route handler (Svix-signed; opt-in via `RESEND_WEBHOOK_SECRET`).
export default defineModule({
  id: "resend",
  category: "email",
  label: "Resend",
  description: "Transactional email via the Resend API, with React Email templates.",
  version: "0.1.0",
  peers: { framework: ["next", "tanstack-start"] },
  homepage: "https://resend.com",
  // `react-email` bundles the components, render helpers, and dev CLI in one
  // package (`@react-email/components` is deprecated). React is a peer it
  // declares, so we add it explicitly here for the slot package.
  dependencies: {
    resend: "^6.12.4",
    "react-email": "^6.3.3",
    react: "^19.0.0",
  },
  env: [
    {
      name: "RESEND_API_KEY",
      example: "re_...",
      required: true,
      description: "Resend API key (Dashboard → API Keys).",
    },
    {
      name: "RESEND_WEBHOOK_SECRET",
      example: "whsec_...",
      required: false,
      description:
        "Svix signing secret for the delivery-event webhook (Dashboard → Webhooks). Only required if you wire up the `/api/webhook/resend` route.",
    },
  ],
  adapters: [
    {
      key: "next",
      match: { framework: "next" },
      templates: [
        { src: "shared/resend.ts", dest: "src/resend.ts", scope: "package" },
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        { src: "shared/welcome.tsx", dest: "src/templates/welcome.tsx", scope: "package" },
        {
          src: "next/webhook.ts",
          dest: "app/api/webhook/resend/route.ts",
          scope: "app",
          template: true,
        },
      ],
    },
    {
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      templates: [
        { src: "shared/resend.ts", dest: "src/resend.ts", scope: "package" },
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        { src: "shared/welcome.tsx", dest: "src/templates/welcome.tsx", scope: "package" },
        {
          src: "tanstack/webhook.ts",
          dest: "src/routes/api/webhook/resend.ts",
          scope: "app",
          template: true,
        },
      ],
    },
  ],
});
