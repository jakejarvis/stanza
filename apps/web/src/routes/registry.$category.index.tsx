import type { CategoryId } from "@stanza/registry";
import { categoryLabel, isCategoryId } from "@stanza/registry";
import { Link, createFileRoute, notFound, useLoaderData } from "@tanstack/react-router";
import { useMemo } from "react";

import { Section, SectionList } from "@/components/detail/section";
import { ModuleLogo } from "@/components/module-logo";
import { Separator } from "@/components/ui/separator";
import { buildHead, getWebSiteJsonLd } from "@/lib/seo";

export const Route = createFileRoute("/registry/$category/")({
  loader: ({ params }) => {
    if (!isCategoryId(params.category)) throw notFound();
    return { category: params.category };
  },
  head: ({ loaderData, params }) => {
    const path = `/registry/${params.category}`;
    if (!loaderData) return buildHead({ title: "Not found", path });
    const label = categoryLabel(loaderData.category);
    return buildHead({
      title: `${label} modules`,
      description: `Every ${label.toLowerCase()} module in the Stanza registry.`,
      path,
      jsonLd: [getWebSiteJsonLd()],
    });
  },
  component: CategoryLandingPage,
});

const CATEGORY_BLURBS: Record<CategoryId, string> = {
  framework: "Web and native app frameworks.",
  ui: "Styling systems and component primitives.",
  db: "Database engines.",
  orm: "Typed query layers over your database.",
  auth: "Authentication providers and session handling.",
  payments: "Checkout, customer portal, and webhooks.",
  email: "Transactional email providers and templates.",
  ai: "AI SDK and provider wiring.",
  tooling: "Linter and formatter toolchains.",
  testing: "Test runners — unit and end-to-end.",
  deploy: "Deploy targets.",
  monorepo: "Workspace task orchestrators.",
};

function CategoryLandingPage() {
  const { category } = Route.useLoaderData();
  const { registry } = useLoaderData({ from: "__root__" });

  const modules = useMemo(
    () =>
      registry.modules
        .filter((m) => m.category === category)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [registry.modules, category],
  );

  const label = categoryLabel(category);

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

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-medium tracking-tight">{label}</h1>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{CATEGORY_BLURBS[category]}</p>
      </header>

      <Separator className="my-8" />

      {modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No modules in this category yet.</p>
      ) : (
        <Section title="Modules" count={modules.length}>
          <SectionList>
            {modules.map((m) => (
              <li key={m.id}>
                <Link
                  to="/registry/$category/$id"
                  params={{ category: m.category, id: m.id }}
                  className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/50"
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
        </Section>
      )}
    </div>
  );
}
