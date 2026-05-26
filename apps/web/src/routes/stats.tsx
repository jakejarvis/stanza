import type { CategoryId, ModuleSummary } from "@stanza/registry";
import { categoryLabel, KNOWN_CATEGORIES } from "@stanza/registry";
import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";

import { BarList } from "@/components/ui/bar-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SparkAreaChart } from "@/components/ui/spark-chart";
import { buildHead } from "@/lib/seo";
import { getStats } from "@/server/stats.functions";

export const Route = createFileRoute("/stats")({
  loader: () => getStats(),
  // Stats are revalidated server-side by the cache TTL; client doesn't need
  // to refetch on every navigation.
  staleTime: 60_000,
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
  const stats = Route.useLoaderData();
  const { registry } = useLoaderData({ from: "__root__" });

  const moduleLabel = (category: CategoryId, id: string): string => {
    const found = registry.modules.find(
      (m: ModuleSummary) => m.category === category && m.id === id,
    );
    return found?.label ?? id;
  };

  const activitySum = stats.activity30d.reduce((acc, day) => acc + day.count, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Stats</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          What modules people actually pick. Aggregated from anonymous CLI telemetry —{" "}
          <a href="#telemetry" className="text-primary underline underline-offset-4">
            see exactly what&rsquo;s collected
          </a>
          .
        </p>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2">
        <HeroStat label="Projects scaffolded" value={stats.projectsScaffolded} />
        <HeroStat label="Modules installed" value={stats.modulesInstalled} />
      </section>

      <section className="mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-baseline justify-between gap-4">
              <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                CLI runs &middot; last 30 days
              </CardTitle>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {activitySum > 0 ? `${numberFormatter.format(activitySum)} total` : "no runs yet"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pb-1">
            <SparkAreaChart
              data={stats.activity30d.map((day) => ({ label: day.date, value: day.count }))}
              ariaLabel="CLI runs per day over the last 30 days"
              height={96}
            />
          </CardContent>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Popular modules by category</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {KNOWN_CATEGORIES.map((category) => {
            const entries = stats.perCategory[category] ?? [];
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
                    data={entries.map((entry) => ({
                      name: moduleLabel(category, entry.id),
                      value: entry.count,
                      trailingSecondary: numberFormatter.format(entry.count),
                      trailing: percentFormatter.format(entry.share),
                      href: moduleHref(category, entry.id),
                    }))}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <TelemetrySection generatedAt={stats.generatedAt} />
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
          {formatCount(value)}
        </p>
      </CardContent>
    </Card>
  );
}

function TelemetrySection({ generatedAt }: { generatedAt: string }) {
  return (
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
              <li>
                Which command you ran (init, add, remove, list, search), how long it took, and
                whether it succeeded.
              </li>
              <li>CLI version, Node version, OS, and architecture.</li>
              <li>For installs/removes: the module id and its category.</li>
              <li>An ephemeral UUID generated per process to deduplicate events.</li>
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
              <li>Your IP address (PostHog ingest is server-proxied through this site).</li>
              <li>Any persistent identifier — the process UUID is discarded on exit.</li>
              <li>
                Anything from CI runs (telemetry auto-skips when <code>CI</code> is set).
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        <strong className="font-medium text-foreground">Opt out</strong> per-invocation with{" "}
        <code>--no-telemetry</code>, persistently with <code>STANZA_TELEMETRY=0</code> or{" "}
        <code>DO_NOT_TRACK=1</code>. More in the{" "}
        <Link
          to="/docs/$"
          params={{ _splat: "cli" }}
          hash="telemetry"
          className="text-primary underline underline-offset-4"
        >
          CLI docs
        </Link>
        .
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Last refreshed {formatGeneratedAt(generatedAt)} UTC.
      </p>
    </section>
  );
}
