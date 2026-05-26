import type { CategoryId, ModuleSummary } from "@stanza/registry";
import { categoryLabel, KNOWN_CATEGORIES } from "@stanza/registry";
import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

import { ModuleLogo } from "@/components/module-logo";
import { BarList } from "@/components/ui/bar-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildHead } from "@/lib/seo";
import { getStats, type Stats } from "@/server/stats.functions";

const ActivityChart = lazy(() => import("@/components/stats/activity-chart"));

export const Route = createFileRoute("/stats")({
  head: () =>
    buildHead({
      title: "Stats",
      description: "Anonymous usage stats for the Stanza CLI — what modules people pick.",
      path: "/stats",
    }),
  component: StatsPage,
});

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

function formatCount(value: number): string {
  if (value <= 0) return "—";
  return numberFormatter.format(value);
}

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function moduleHref(category: CategoryId, id: string): string {
  return `/registry/${category}/${id}`;
}

function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const { registry } = useLoaderData({ from: "__root__" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getStats();
        if (!cancelled) setStats(result);
      } catch {
        // Swallow: the shell already shows the em-dash / "no data yet"
        // empty state, which is the right UX for a public dashboard that
        // happens to hit a transient PostHog blip.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = stats === null;

  const findModule = (category: CategoryId, id: string): ModuleSummary | undefined =>
    registry.modules.find((m: ModuleSummary) => m.category === category && m.id === id);

  const activitySum = stats?.activity30d.reduce((acc, day) => acc + day.count, 0) ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Stats</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          What modules developers actually pick, aggregated from anonymous CLI telemetry —{" "}
          <a href="#telemetry" className="text-primary underline underline-offset-3">
            see exactly what&rsquo;s collected
          </a>
          .
        </p>
        {stats ? (
          <p className="mt-4 font-mono text-xs text-muted-foreground/70 tabular-nums">
            Last refreshed {formatGeneratedAt(stats.generatedAt)} UTC
          </p>
        ) : null}
      </header>

      <section className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Projects scaffolded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
              {formatCount(stats?.projectsScaffolded ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Modules installed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
              {formatCount(stats?.modulesInstalled ?? 0)}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-baseline justify-between gap-4">
              <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                CLI runs &middot; last 30 days
              </CardTitle>
              {!isLoading ? (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {activitySum > 0
                    ? `${numberFormatter.format(activitySum)} total`
                    : "No runs yet."}
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="pb-1">
            <Suspense fallback={<div aria-hidden className="h-24 w-full" />}>
              <ActivityChart activity30d={stats?.activity30d ?? []} isLoading={isLoading} />
            </Suspense>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Popular modules by category</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {KNOWN_CATEGORIES.map((category) => {
            const entries = stats?.perCategory[category] ?? [];
            const totalInCategory = entries.reduce((acc, entry) => acc + entry.count, 0);
            return (
              <Card key={category}>
                <CardHeader>
                  <div className="flex items-baseline justify-between gap-3">
                    <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                      {categoryLabel(category)}
                    </CardTitle>
                    {totalInCategory > 0 ? (
                      <span className="font-mono text-xs text-muted-foreground/70 tabular-nums">
                        {numberFormatter.format(totalInCategory)}
                      </span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <BarList
                    emptyMessage={isLoading ? "Loading…" : "No data yet."}
                    data={entries.map((entry) => {
                      const summary = findModule(category, entry.id);
                      const label = summary?.label ?? entry.id;
                      return {
                        name: label,
                        value: entry.count,
                        leading: <ModuleLogo logo={summary?.logo} label={label} size="sm" />,
                        trailingSecondary: numberFormatter.format(entry.count),
                        trailing: percentFormatter.format(entry.share),
                        href: moduleHref(category, entry.id),
                      };
                    })}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section id="telemetry" className="scroll-mt-20">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Telemetry policy</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                What we save
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Which command you ran, how long it took, and whether it succeeded.</li>
                <li>CLI version, Node version, OS, and architecture.</li>
                <li>For installs/removes, the module ID and its category.</li>
                <li>An ephemeral UUID generated per-process to deduplicate events.</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                What we don&rsquo;t
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                <li>File paths, project names, environment variables, or template contents.</li>
                <li>Your IP address (PostHog ingest is server-proxied).</li>
                <li>Any persistent identifier — the process UUID is discarded on exit.</li>
                <li>
                  Anything from CI runs (telemetry auto-skips when <code>CI</code> is set).
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          <strong className="font-medium text-foreground">Opt out</strong> per-invocation with{" "}
          <code>--no-telemetry</code>, or permanently with <code>STANZA_TELEMETRY=0</code> or{" "}
          <code>DO_NOT_TRACK=1</code>. Learn more in the{" "}
          <Link
            to="/docs/$"
            params={{ _splat: "cli" }}
            hash="telemetry"
            className="text-primary underline underline-offset-1"
          >
            CLI docs
          </Link>{" "}
          or{" "}
          <a
            href="https://github.com/jakejarvis/stanza/blob/main/apps/cli/src/lib/telemetry.ts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-1"
          >
            audit the code
          </a>{" "}
          yourself.
        </p>
      </section>
    </div>
  );
}
