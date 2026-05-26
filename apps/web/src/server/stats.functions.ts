import type { CategoryId } from "@stanza/registry";
import { KNOWN_CATEGORIES } from "@stanza/registry";
import { createServerFn } from "@tanstack/react-start";
import { getCache, waitUntil } from "@vercel/functions";

import { getQueryConfig, runQuery } from "@/server/posthog-query.server";

export type ModuleStat = { id: string; count: number; share: number };

export type Stats = {
  projectsScaffolded: number;
  modulesInstalled: number;
  /** Top 5 modules per category, ranked by install count. Empty when there's no data. */
  perCategory: Partial<Record<CategoryId, ModuleStat[]>>;
  /** Exactly 30 entries, oldest to newest, filled with zeros for empty days. */
  activity30d: Array<{ date: string; count: number }>;
  generatedAt: string;
};

const CACHE_KEY = "stats:v1";
const SOFT_TTL_MS = 60 * 60 * 1000; // 1 hour
const HARD_TTL_SEC = 24 * 60 * 60; // 24 hours

/**
 * Empty shell returned when no PostHog read key is configured (local dev,
 * self-hosters) or when every query fails. The page renders the layout with
 * em-dashes / empty states instead of erroring.
 */
function zeroStats(): Stats {
  return {
    projectsScaffolded: 0,
    modulesInstalled: 0,
    perCategory: {},
    activity30d: thirtyDaysBackfilled(new Map()),
    generatedAt: new Date().toISOString(),
  };
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build a 30-day series ending today (UTC), pulling counts from the provided
 * map where they exist and using zero everywhere else. Keeps the sparkline a
 * fixed length and the dates aligned regardless of how sparse the dataset is.
 */
function thirtyDaysBackfilled(counts: Map<string, number>): Stats["activity30d"] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days: Stats["activity30d"] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const key = toDateKey(d);
    days.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return days;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

/**
 * Pull all four queries. Returns `ok: false` if no key is configured or any
 * query fails — callers should skip the cache in that case so a transient
 * PostHog outage doesn't pin em-dashes for an hour.
 */
async function fetchStats(): Promise<{ stats: Stats; ok: boolean }> {
  const config = getQueryConfig();
  if (!config) return { stats: zeroStats(), ok: false };

  const [projectsRows, modulesRows, perCategoryRows, activityRows] = await Promise.all([
    runQuery(
      `SELECT count(DISTINCT distinct_id) FROM events
       WHERE event = 'cli_command' AND properties.command = 'init'`,
      config,
    ),
    runQuery(
      `SELECT count() FROM events
       WHERE event = 'cli_module' AND properties.action = 'install'`,
      config,
    ),
    // One query for all categories — group by both and bucket client-side.
    runQuery(
      `SELECT properties.group AS group, properties.module AS module, count() AS c
       FROM events
       WHERE event = 'cli_module' AND properties.action = 'install'
       GROUP BY group, module
       ORDER BY c DESC`,
      config,
    ),
    runQuery(
      `SELECT toDate(timestamp) AS day, count() AS c FROM events
       WHERE event = 'cli_command' AND timestamp >= now() - INTERVAL 30 DAY
       GROUP BY day ORDER BY day`,
      config,
    ),
  ]);

  if (
    projectsRows === null ||
    modulesRows === null ||
    perCategoryRows === null ||
    activityRows === null
  ) {
    return { stats: zeroStats(), ok: false };
  }

  const projectsScaffolded = toNumber(projectsRows[0]?.[0]);
  const modulesInstalled = toNumber(modulesRows[0]?.[0]);

  // Group installs by category, keep top 5 per category, compute share
  // (denominator-by-category — simplest and avoids the init-vs-add ambiguity).
  const perCategory: Partial<Record<CategoryId, ModuleStat[]>> = {};
  const totalsByCategory = new Map<CategoryId, number>();
  const bucketed = new Map<CategoryId, Array<{ id: string; count: number }>>();
  for (const row of perCategoryRows) {
    const group = toStringValue(row[0]);
    const moduleId = toStringValue(row[1]);
    const count = toNumber(row[2]);
    if (!group || !moduleId || count <= 0) continue;
    if (!isKnownCategory(group)) continue;
    totalsByCategory.set(group, (totalsByCategory.get(group) ?? 0) + count);
    const bucket = bucketed.get(group) ?? [];
    bucket.push({ id: moduleId, count });
    bucketed.set(group, bucket);
  }
  for (const category of KNOWN_CATEGORIES) {
    const bucket = bucketed.get(category);
    if (!bucket) continue;
    const total = totalsByCategory.get(category) ?? 0;
    if (total === 0) continue;
    perCategory[category] = bucket
      .slice(0, 5)
      .map((entry) => ({ id: entry.id, count: entry.count, share: entry.count / total }));
  }

  const activityCounts = new Map<string, number>();
  for (const row of activityRows) {
    const day = toStringValue(row[0]);
    if (!day) continue;
    // HogQL returns YYYY-MM-DD strings; normalize just in case.
    const key = day.length >= 10 ? day.slice(0, 10) : day;
    activityCounts.set(key, toNumber(row[1]));
  }

  return {
    stats: {
      projectsScaffolded,
      modulesInstalled,
      perCategory,
      activity30d: thirtyDaysBackfilled(activityCounts),
      generatedAt: new Date().toISOString(),
    },
    ok: true,
  };
}

function isKnownCategory(value: string): value is CategoryId {
  return KNOWN_CATEGORIES.some((id) => id === value);
}

/**
 * Refetch from PostHog and write to the cache on success. Only successful
 * fetches are cached; a failed query returns the zero-shape without polluting
 * the cache so a transient PostHog outage doesn't pin em-dashes for an hour.
 */
async function refreshAndCache(cache: ReturnType<typeof getCache>): Promise<Stats> {
  const { stats, ok } = await fetchStats();
  if (ok) {
    await cache.set(CACHE_KEY, stats, { ttl: HARD_TTL_SEC, tags: ["stats"] }).catch(() => {});
  }
  return stats;
}

/**
 * Server function powering `/stats`. Wraps the PostHog HogQL queries in
 * Vercel's Runtime Cache (per-region) with stale-while-revalidate semantics:
 *
 *   - Cache hit, age < 1h         → return immediately, no work
 *   - Cache hit, 1h ≤ age < 24h   → return STALE immediately, refresh in
 *                                    background via `waitUntil` so the next
 *                                    request sees fresh data
 *   - Cache miss or age ≥ 24h     → block on a fresh fetch (the only path
 *                                    that pays the ~1-3s PostHog latency)
 *
 * Once warm, every visitor sees ~10ms reads — including the unlucky one whose
 * request happens to land just after the soft TTL expires.
 */
export const getStats = createServerFn({ method: "GET" }).handler(async (): Promise<Stats> => {
  const cache = getCache();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const cached = (await cache.get(CACHE_KEY).catch(() => null)) as Stats | null;

  if (cached) {
    const age = Date.now() - new Date(cached.generatedAt).getTime();
    if (age < SOFT_TTL_MS) {
      // Fresh — nothing to do.
      return cached;
    }
    // Stale-but-usable: serve it, refresh in the background so we don't
    // block the response on the PostHog round-trip.
    waitUntil(refreshAndCache(cache).catch(() => {}));
    return cached;
  }

  // Truly cold: block and fetch. Only happens once per region per HARD_TTL.
  return refreshAndCache(cache);
});
