import { PostHog } from "posthog-node";

/**
 * Server-only PostHog client. Holds the project key (read from env) and talks
 * to PostHog's HTTP API so the `/api/events` proxy never has to hand-roll the
 * capture protocol. Returns `null` when no key is configured (local dev /
 * self-host without analytics) so callers can no-op.
 *
 * `flushAt: 1` + `flushInterval: 0` make capture send eagerly; serverless
 * handlers should still `await client.flush()` before returning since the
 * function may freeze before an in-flight request settles.
 */

let client: PostHog | null = null;

export function getPostHogServerClient(): PostHog | null {
  const apiKey = process.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return null;

  if (!client) {
    client = new PostHog(apiKey, {
      host: process.env.VITE_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}
