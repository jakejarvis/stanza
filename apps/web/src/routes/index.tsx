import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";

import { Builder } from "@/components/builder";
import { validateBuilderSearch } from "@/lib/selection";
import { buildHead, getWebSiteJsonLd } from "@/lib/seo";
import { getBuilderState } from "@/server/builder-state.functions";

export const Route = createFileRoute("/")({
  validateSearch: validateBuilderSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getBuilderState({ data: deps }),
  staleTime: Infinity,
  head: () =>
    buildHead({
      titleOverride: "Stanza — Modular TypeScript Monorepo Builder",
      description:
        "Pick your modules and walk away with a clean TypeScript monorepo. Idiomatic, vendored code that’s yours the moment it lands.",
      path: "/",
      jsonLd: [getWebSiteJsonLd()],
    }),
  component: Page,
});

function Page() {
  const state = Route.useLoaderData();
  const search = Route.useSearch();
  // Registry index is loaded once by the root route — read it here instead of
  // re-shipping it in our own loader data.
  const { registry } = useLoaderData({ from: "__root__" });
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-medium tracking-tight">
          Build your stack, minus the pressure.
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Pick your modules and walk away with a clean TypeScript monorepo. Idiomatic, vendored code
          that’s yours the moment it lands. Add more modules or swap them out at any time.
        </p>
        <p className="mt-1">
          <Link
            to="/docs/$"
            params={{ _splat: "" }}
            className="text-primary underline underline-offset-3 hover:text-primary/80"
          >
            Learn more…
          </Link>
        </p>
      </header>
      <Builder state={state} search={search} metadata={registry.modules} />
    </div>
  );
}
