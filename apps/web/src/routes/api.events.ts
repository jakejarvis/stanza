import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";

import { getPostHogServerClient } from "@/server/posthog.server";

/**
 * `POST /api/events` — analytics ingest for the `@stanza/cli`. The CLI sends
 * plain `fetch` batches here so it never has to bundle `posthog-node`; this
 * route holds the PostHog project key server-side and forwards each event via
 * the `posthog-node` client.
 *
 * Configure via env (set these in the Vercel project for prod):
 *   VITE_PUBLIC_POSTHOG_KEY  — the PostHog project key. When unset the route
 *                              no-ops (returns 204) so local dev / self-hosters
 *                              never error.
 *   VITE_PUBLIC_POSTHOG_HOST — PostHog ingest host. Defaults to
 *                              https://us.i.posthog.com.
 */

const MAX_EVENTS = 20;

type IncomingEvent = {
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
};

type Payload = {
  distinctId: string;
  events: IncomingEvent[];
};

function parsePayload(body: unknown): Payload | null {
  if (typeof body !== "object" || body === null) return null;
  const { distinctId, events } = body as Record<string, unknown>;
  if (typeof distinctId !== "string" || distinctId.length === 0) return null;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS) return null;
  for (const e of events) {
    if (typeof e !== "object" || e === null) return null;
    if (typeof (e as IncomingEvent).event !== "string") return null;
  }
  return { distinctId, events: events as IncomingEvent[] };
}

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const payload = parsePayload(body);
        if (!payload) return new Response("Invalid payload", { status: 400 });

        const posthog = getPostHogServerClient();
        // No key configured (local dev / self-host without analytics): accept
        // and discard so the CLI never sees an error.
        if (!posthog) return new Response(null, { status: 204 });

        for (const e of payload.events) {
          posthog.capture({
            distinctId: payload.distinctId,
            event: e.event,
            properties: e.properties ?? {},
            timestamp: e.timestamp ? new Date(e.timestamp) : undefined,
          });
        }

        // Serverless functions can freeze before in-flight requests settle, so
        // hand the flush to `waitUntil` to keep it alive past the response
        // without blocking it. Telemetry must never surface as a user-facing
        // error, so swallow failures.
        waitUntil(posthog.flush().catch(() => {}));

        return new Response(null, { status: 202 });
      },
    },
  },
});
