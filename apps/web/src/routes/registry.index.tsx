import { IconArrowLeft } from "@tabler/icons-react";
import { Link, createFileRoute, useLoaderData } from "@tanstack/react-router";
import type { Category, ModuleMetadata } from "@withstanza/schema";
import { useMemo } from "react";

import { SectionList } from "@/components/detail/section";
import { ModuleLogo } from "@/components/module-logo";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { buildHead, getWebSiteJsonLd } from "@/lib/seo";

export const Route = createFileRoute("/registry/")({
  head: () =>
    buildHead({
      title: "Registry",
      description: "Every first-party module Stanza can install, grouped by category.",
      path: "/registry",
      jsonLd: [getWebSiteJsonLd()],
    }),
  component: RegistryIndexPage,
});

type CategoryGroup = { category: Category; modules: ModuleMetadata[] };

function RegistryIndexPage() {
  const { registry } = useLoaderData({ from: "__root__" });

  // Group modules under their category, preserving the index's topological
  // category order. Every category is rendered (even empty ones) so the page
  // links to all category landing pages — it doubles as a registry sitemap.
  const groups = useMemo<CategoryGroup[]>(() => {
    const byCategory = new Map<string, ModuleMetadata[]>();
    for (const m of registry.modules) {
      const list = byCategory.get(m.category);
      if (list) list.push(m);
      else byCategory.set(m.category, [m]);
    }
    return registry.categories.map((category) => ({
      category,
      modules: (byCategory.get(category.id) ?? []).toSorted((a, b) =>
        a.label.localeCompare(b.label),
      ),
    }));
  }, [registry]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconArrowLeft className="size-3" aria-hidden="true" />
          Back to builder
        </Link>
      </div>

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-medium tracking-tight text-balance">Registry</h1>
        </div>
        <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
          Every first-party module Stanza can install, grouped by category.
        </p>
      </header>

      <Separator className="my-8" />

      <div className="space-y-8">
        {groups.map(({ category, modules }) => (
          <CategoryGroupSection key={category.id} category={category} modules={modules} />
        ))}
      </div>
    </div>
  );
}

function CategoryGroupSection({
  category,
  modules,
}: {
  category: Category;
  modules: ModuleMetadata[];
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Link to="/registry/$category" params={{ category: category.id }}>
          <h2 className="text-[13px] font-medium tracking-tight text-muted-foreground transition-colors group-hover:text-foreground">
            {category.label}
          </h2>
        </Link>
        <Badge
          variant="secondary"
          className="h-auto px-1.5 py-1 font-mono text-[11px] leading-none tabular-nums"
        >
          {modules.length}
        </Badge>
      </div>

      {modules.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No modules in this category (yet).</p>
      ) : (
        <SectionList>
          {modules.map((m) => (
            <li key={m.id}>
              <Link
                to="/registry/$category/$id"
                params={{ category: m.category, id: m.id }}
                className="flex items-start gap-3 p-3 transition-colors hover:bg-muted/50"
              >
                <ModuleLogo logo={m.logo} label={m.label} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm leading-tight font-medium">{m.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {m.description}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </SectionList>
      )}
    </section>
  );
}
