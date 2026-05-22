import { KNOWN_CATEGORIES } from "@stanza/registry";
import { createFileRoute } from "@tanstack/react-router";

import { Builder } from "@/components/builder";
import type { BuilderSearch } from "@/lib/selection";
import { buildHead } from "@/lib/seo";
import { getBuilderState } from "@/server/builder-state.functions";

// Keys are derived from the canonical slot + add-on tuples so this never
// drifts when a slot or category is added. `parseSelections` splits the
// comma-joined add-on values downstream.
const SEARCH_KEYS = ["name", "pm", ...KNOWN_CATEGORIES] as const;

function validateSearch(input: Record<string, unknown>): BuilderSearch {
  const out: BuilderSearch = {};
  for (const key of SEARCH_KEYS) {
    const v = input[key];
    if (typeof v === "string" && v.length > 0) out[key] = v;
  }
  return out;
}

export const Route = createFileRoute("/")({
  validateSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getBuilderState({ data: deps }),
  head: () =>
    buildHead({
      title: "Build your stack",
      description:
        "Pick a framework, ORM, database, auth provider, and styling. Get a clean monorepo with idiomatic, vendored code.",
      path: "/",
    }),
  component: Page,
});

function Page() {
  const state = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Build your stack</h1>
        <p className="mt-2 text-muted-foreground">
          Pick a framework, ORM, database, auth provider, and styling. Get a clean monorepo with
          idiomatic, vendored code. Add modules later with <code>stanza add</code>.
        </p>
      </header>
      <Builder state={state} search={search} />
    </div>
  );
}
