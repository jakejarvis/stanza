import type { SlotId } from "@stanza/registry";
import { KNOWN_SLOTS, slotLabel } from "@stanza/registry";
import { IconExternalLink } from "@tabler/icons-react";
import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";

import { AdapterSwitcher } from "@/components/detail/adapter-switcher";
import { DepsTable } from "@/components/detail/deps-table";
import { EnvTable } from "@/components/detail/env-table";
import { TemplatesList } from "@/components/detail/templates-list";
import { TryIt } from "@/components/detail/try-it";
import { ModuleLogo } from "@/components/module-logo";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { buildCommand } from "@/lib/selection";
import { buildHead } from "@/lib/seo";
import { getModuleDetail } from "@/server/module-detail";

type DetailSearch = Partial<Record<SlotId, string>>;

function validateSearch(input: Record<string, unknown>): DetailSearch {
  const out: DetailSearch = {};
  for (const slot of KNOWN_SLOTS) {
    const v = input[slot];
    if (typeof v === "string" && v.length > 0) out[slot] = v;
  }
  return out;
}

export const Route = createFileRoute("/m/$slot/$id")({
  validateSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    if (!isSlotId(params.slot)) throw notFound();
    const detail = await getModuleDetail({
      data: { slot: params.slot, id: params.id, peers: deps },
    });
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ loaderData, params }) =>
    buildHead({
      title: loaderData?.module.label ?? params.id,
      description: loaderData?.module.description,
      path: `/m/${params.slot}/${params.id}`,
      ogImage: `/og/${params.slot}/${params.id}.png`,
      type: "article",
    }),
  component: ModuleDetailPage,
});

function isSlotId(slot: string): slot is SlotId {
  return (KNOWN_SLOTS as readonly string[]).includes(slot);
}

function ModuleDetailPage() {
  const detail = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { module, adapter, resolvedPeers, peerOptions, effective, previews, index } = detail;

  const onPeerChange = (slot: SlotId, id: string) => {
    void navigate({
      search: { ...search, [slot]: id },
      replace: true,
    });
  };

  // Build a "Try it" command using the same builder helper, treating the
  // current module + resolved peers as a complete-enough selection.
  const command = buildCommand({
    name: "my-app",
    selections: { ...resolvedPeers, [module.slot]: module.id },
  });

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
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{module.label}</h1>
            <Badge variant="outline">{slotLabel(module.slot)}</Badge>
            <span className="font-mono text-xs text-muted-foreground/60">v{module.version}</span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{module.description}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {module.homepage && (
              <a
                href={module.homepage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                Homepage <IconExternalLink className="size-3" />
              </a>
            )}
            {module.author && <span className="text-muted-foreground">by {module.author}</span>}
            <span className="font-mono text-muted-foreground/70">
              {module.slot}/{module.id}
            </span>
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
        <DepsTable title="Dependencies" entries={effective.dependencies} />
        <DepsTable title="Dev dependencies" entries={effective.devDependencies} />
        <EnvTable env={effective.env} />
        <DepsTable title="Scripts" entries={effective.scripts} />
        <TemplatesList templates={adapter.templates ?? []} previews={previews} />
        <TryIt command={command} />
      </div>

      {/* Hidden meta — useful for the future when more fields exist */}
      <Separator className="my-8" />
      <p className="text-[11px] text-muted-foreground/60">
        Adapter key: <code className="font-mono">{adapter.key}</code>
        {Object.keys(adapter.match).length > 0 && (
          <>
            {" · "}
            matches{" "}
            {Object.entries(adapter.match)
              .map(([slot, id]) => `${slot}=${id}`)
              .join(", ")}
          </>
        )}
      </p>
    </div>
  );
}

function hasSwitchable(peerOptions: Partial<Record<SlotId, string[]>>): boolean {
  return Object.values(peerOptions).some((opts) => opts && opts.length > 1);
}
