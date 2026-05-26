/**
 * Thin server-side wrapper around PostHog's HogQL Query API. Used by the
 * `/stats` page to read aggregates back out of PostHog without bundling the
 * full `posthog-node` client surface or learning the Personal API key into the
 * browser.
 *
 * Configure via env (set these in the Vercel project for prod):
 *   POSTHOG_QUERY_API_KEY — personal API key scoped `query:read`. Distinct
 *                           from the public `VITE_PUBLIC_POSTHOG_KEY` which is
 *                           write-only.
 *   POSTHOG_PROJECT_ID    — numeric project id (visible in the PostHog URL).
 *   POSTHOG_QUERY_HOST    — API host. Defaults to `https://us.posthog.com`
 *                           (note: distinct from the ingest host
 *                           `us.i.posthog.com`).
 *
 * Returns `null` whenever any of the required env is missing so callers can
 * gracefully degrade (the `/stats` page shows em-dashes instead of erroring).
 */

const DEFAULT_QUERY_HOST = "https://us.posthog.com";

export type QueryConfig = {
  apiKey: string;
  projectId: string;
  host: string;
};

export function getQueryConfig(): QueryConfig | null {
  const apiKey = process.env.POSTHOG_QUERY_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  return {
    apiKey,
    projectId,
    host: process.env.POSTHOG_QUERY_HOST ?? DEFAULT_QUERY_HOST,
  };
}

type HogQLResponse = {
  results?: unknown[][];
};

/**
 * Run a HogQL query and return the rows as a 2D array. Each inner array is a
 * row in column order; callers know their own query shape and project each row
 * into the expected tuple. Returns `null` on any failure (network error,
 * non-2xx, malformed body) so callers can distinguish "query failed" from
 * "query succeeded with zero rows" — the latter is a real result worth
 * caching, the former is not.
 */
export async function runQuery(sql: string, config: QueryConfig): Promise<unknown[][] | null> {
  try {
    const res = await fetch(`${config.host}/api/projects/${config.projectId}/query/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const body = (await res.json()) as HogQLResponse;
    return Array.isArray(body.results) ? body.results : null;
  } catch {
    return null;
  }
}
