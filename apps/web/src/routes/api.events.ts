import { createFileRoute } from "@tanstack/react-router";

/**
 * `POST /api/events` — analytics ingest for the `@stanza/cli`. The CLI sends
 * plain `fetch` batches here so it never has to bundle `posthog-node`; this
 * route holds the PostHog project key server-side and forwards to PostHog's
 * HTTP capture API.
 *
 * Configure via env (set these in the Vercel project for prod):
 *   POSTHOG_API_KEY — the PostHog project key. When unset the route no-ops
 *                     (returns 204) so local dev / self-hosters never error.
 *   POSTHOG_HOST    — PostHog ingest host. Defaults to https://us.i.posthog.com.
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

        const apiKey = process.env.POSTHOG_API_KEY;
        // No key configured (local dev / self-host without analytics): accept
        // and discard so the CLI never sees an error.
        if (!apiKey) return new Response(null, { status: 204 });

        const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
        const batch = payload.events.map((e) => ({
          event: e.event,
          distinct_id: payload.distinctId,
          properties: e.properties ?? {},
          timestamp: e.timestamp,
        }));

        try {
          await fetch(`${host.replace(/\/$/, "")}/batch/`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ api_key: apiKey, batch }),
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          // Telemetry must never surface as a user-facing error — swallow.
        }

        return new Response(null, { status: 202 });
      },
    },
  },
});
