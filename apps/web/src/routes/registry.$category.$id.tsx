import type { CategoryId } from "@stanza/registry";
import { categoryLabel, KNOWN_CATEGORIES, PEER_CATEGORIES } from "@stanza/registry";
import { IconExternalLink } from "@tabler/icons-react";
import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { AdapterSwitcher } from "@/components/detail/adapter-switcher";
import { Install } from "@/components/detail/install";
import { DepsTable, ScriptsTable, EnvTable } from "@/components/detail/tables";
import { TemplatesList } from "@/components/detail/templates-list";
import { ModuleLogo } from "@/components/module-logo";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Selections } from "@/lib/selection";
import { buildHead, getSoftwareSourceCodeJsonLd } from "@/lib/seo";
import { getModuleDetail } from "@/server/module-detail.functions";

type DetailSearch = Partial<Record<CategoryId, string>>;

function validateSearch(input: Record<string, unknown>): DetailSearch {
  const out: DetailSearch = {};
  for (const category of PEER_CATEGORIES) {
    const v = input[category];
    if (typeof v === "string" && v.length > 0) out[category] = v;
  }
  return out;
}

export const Route = createFileRoute("/registry/$category/$id")({
  validateSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    if (!isGroup(params.category)) throw notFound();
    const detail = await getModuleDetail({
      data: { category: params.category, id: params.id, peers: deps },
    });
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ loaderData, params }) => {
    const path = `/registry/${params.category}/${params.id}`;
    if (!loaderData) return buildHead({ title: "Not found", path });
    const { module } = loaderData;
    return buildHead({
      title: module.label,
      description: module.description,
      path,
      ogImage: `/og/registry/${params.category}/${params.id}`,
      type: "article",
      jsonLd: [
        getSoftwareSourceCodeJsonLd({
          name: module.label,
          description: module.description,
          path,
          version: module.version,
          author: module.author,
          homepage: module.homepage,
        }),
      ],
    });
  },
  component: ModuleDetailPage,
});

function isGroup(group: string): group is CategoryId {
  return (KNOWN_CATEGORIES as readonly string[]).includes(group);
}

function ModuleDetailPage() {
  const detail = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { module, adapter, resolvedPeers, peerOptions, effective, previews, index } = detail;

  const onPeerChange = useCallback(
    (category: CategoryId, id: string) => {
      void navigate({
        search: { ...search, [category]: id },
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, search],
  );

  const templates = useMemo(() => adapter.templates ?? [], [adapter.templates]);

  // Build the install selection: the current module + its resolved peers, as
  // arrays (the unified selection shape). CommandPreview turns this into the
  // package-manager-specific command string (`--framework=next --testing=vitest`).
  const selections = useMemo<Selections>(() => {
    const out: Selections = {};
    for (const category of KNOWN_CATEGORIES) {
      const id = resolvedPeers[category];
      if (id !== undefined) out[category] = [id];
    }
    out[module.category] = [module.id];
    return out;
  }, [resolvedPeers, module.category, module.id]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <Link
          to="/"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to builder
        </Link>
      </div>

      <header className="flex flex-wrap items-start gap-4">
        <ModuleLogo logo={module.logo} label={module.label} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-medium tracking-tight">{module.label}</h1>
            <Badge variant="outline">{categoryLabel(module.category)}</Badge>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{module.description}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {module.homepage && (
              <a
                href={module.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                Website
                <IconExternalLink className="size-3" aria-hidden />
              </a>
            )}
            {module.author && <span className="text-muted-foreground">by {module.author}</span>}
          </div>
        </div>
      </header>

      <Separator className="my-8" />

      {/* Adapter switcher — hidden when no peer has multiple options */}
      <AdapterSwitcher
        index={index}
        peerOptions={peerOptions}
        resolvedPeers={resolvedPeers}
        onChange={onPeerChange}
      />

      {hasSwitchable(peerOptions) && <Separator className="my-8" />}

      <div className="space-y-8">
        <h2 className="sr-only">Module details</h2>
        <DepsTable title="Dependencies" entries={effective.dependencies} />
        <DepsTable title="Dev dependencies" entries={effective.devDependencies} />
        <EnvTable env={effective.env} />
        <ScriptsTable entries={effective.scripts} />
        <TemplatesList templates={templates} previews={previews} />
        <Install name="my-app" selections={selections} />
      </div>
    </div>
  );
}

function hasSwitchable(peerOptions: Partial<Record<CategoryId, string[]>>): boolean {
  return Object.values(peerOptions).some((opts) => opts && opts.length > 1);
}
