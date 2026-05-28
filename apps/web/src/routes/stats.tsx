import NumberFlow from "@number-flow/react";
import type { CategoryId, ModuleMetadata } from "@stanza/registry";
import { categoryLabel, KNOWN_CATEGORIES } from "@stanza/registry";
import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

import { ModuleLogo } from "@/components/module-logo";
import { BarList } from "@/components/stats/bar-list";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTimeAgo } from "@/hooks/use-time-ago";
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

const numberFormatter = new Intl.NumberFormat();
const percentFormatter = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0,
});

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function LastRefreshed({ iso }: { iso: string }) {
  const ago = useTimeAgo(iso);
  return (
    <p className="font-mono text-xs leading-4 text-muted-foreground/85">
      Last refreshed{" "}
      <Tooltip>
        <TooltipTrigger
          nativeButton={false}
          render={<time dateTime={iso} className="cursor-help tabular-nums" />}
        >
          {ago}
        </TooltipTrigger>
        <TooltipContent sideOffset={8}>{formatGeneratedAt(iso)} UTC</TooltipContent>
      </Tooltip>
      .
    </p>
  );
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

  const findModule = (category: CategoryId, id: string): ModuleMetadata | undefined =>
    registry.modules.find((m) => m.category === category && m.id === id);

  const activitySum = stats?.activity30d.reduce((acc, day) => acc + day.count, 0) ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8 max-w-2xl">
        <h1 className="mb-2 text-3xl font-medium tracking-tight">Stats</h1>
        <p className="mb-4 text-pretty text-muted-foreground">
          What modules developers actually pick, aggregated from anonymous CLI telemetry —{" "}
          <a
            href="#telemetry"
            className="text-primary underline underline-offset-3 hover:text-primary/80"
          >
            see exactly what&rsquo;s collected
          </a>
          .
        </p>
        {stats ? <LastRefreshed iso={stats.generatedAt} /> : <Skeleton className="h-4 w-48" />}
      </header>

      <section className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card size="sm" className="gap-2! pb-2!">
          <CardHeader>
            <CardTitle className="text-xs! font-medium tracking-wider text-foreground/80 uppercase">
              Projects scaffolded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-4xl font-medium tracking-tight tabular-nums">
              <NumberFlow value={stats?.projectsScaffolded ?? 0} />
            </div>
          </CardContent>
        </Card>
        <Card size="sm" className="gap-2! pb-2!">
          <CardHeader>
            <CardTitle className="text-xs! font-medium tracking-wider text-foreground/80 uppercase">
              Modules installed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-4xl font-medium tracking-tight tabular-nums">
              <NumberFlow value={stats?.modulesInstalled ?? 0} />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8">
        <Card size="sm" className="gap-2! pb-2!">
          <CardHeader>
            <CardTitle className="text-xs! font-medium tracking-wider text-foreground/80 uppercase">
              CLI runs{" "}
              <span className="text-muted-foreground">&middot; last&nbsp;30&nbsp;days</span>
            </CardTitle>
            <CardAction className="font-mono text-xs text-muted-foreground tabular-nums">
              {stats ? (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {activitySum > 0
                    ? `${numberFormatter.format(activitySum)} total`
                    : "No runs yet."}
                </span>
              ) : null}
            </CardAction>
          </CardHeader>
          <CardContent className="px-1!">
            <Suspense fallback={<div aria-hidden="true" className="h-24 w-full" />}>
              <ActivityChart activity30d={stats?.activity30d ?? []} isLoading={stats === null} />
            </Suspense>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium tracking-tight text-balance">
          Popular modules by category
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {KNOWN_CATEGORIES.map((category) => {
            const entries = stats?.perCategory[category] ?? [];
            const totalInCategory = entries.reduce((acc, entry) => acc + entry.count, 0);
            return (
              <Card size="sm" key={category}>
                <CardHeader>
                  <CardTitle className="text-xs! font-medium tracking-wider text-foreground/80 uppercase">
                    {categoryLabel(category)}
                  </CardTitle>
                  <CardAction className="font-mono text-xs text-muted-foreground tabular-nums">
                    {totalInCategory > 0 ? numberFormatter.format(totalInCategory) : null}
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <BarList
                    emptyMessage={stats ? "No data yet." : "Loading…"}
                    data={entries.map((entry) => {
                      const meta = findModule(category, entry.id);
                      const label = meta?.label ?? entry.id;
                      return {
                        name: label,
                        value: entry.count,
                        leading: <ModuleLogo logo={meta?.logo} label={label} size="sm" />,
                        trailingSecondary: numberFormatter.format(entry.count),
                        trailing: percentFormatter.format(entry.share),
                        href: `/registry/${category}/${entry.id}`,
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
        <h2 className="mb-4 text-lg font-medium tracking-tight text-balance">Telemetry policy</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card size="sm" className="gap-2.5!">
            <CardHeader>
              <CardTitle className="text-xs! font-medium tracking-wider text-foreground/80 uppercase">
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
          <Card size="sm" className="gap-2.5!">
            <CardHeader>
              <CardTitle className="text-xs! font-medium tracking-wider text-foreground/80 uppercase">
                What we don&rsquo;t
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                <li>File paths, project names, environment variables, or template contents.</li>
                <li>Your IP address (PostHog ingest is server-proxied).</li>
                <li>Any persistent identifier — the process UUID is discarded on exit.</li>
                <li>
                  Anything from CI runs (telemetry auto-skips when <code translate="no">CI</code> is
                  set).
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          <strong className="font-medium text-foreground">Opt out</strong> per-invocation with{" "}
          <code translate="no">--no-telemetry</code>, or permanently with{" "}
          <code translate="no">STANZA_TELEMETRY=0</code> or{" "}
          <code translate="no">DO_NOT_TRACK=1</code>. Learn more in the{" "}
          <Link
            to="/docs/$"
            params={{ _splat: "cli" }}
            hash="telemetry"
            className="text-primary underline underline-offset-1 hover:text-primary/80"
          >
            CLI docs
          </Link>{" "}
          or{" "}
          <a
            href="https://github.com/jakejarvis/stanza/blob/main/apps/cli/src/lib/telemetry.ts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-1 hover:text-primary/80"
          >
            audit the code
          </a>{" "}
          yourself.
        </p>
      </section>
    </div>
  );
}
