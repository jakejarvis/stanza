import { KNOWN_CATEGORIES } from "@stanza/registry";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";

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
        "Pick your modules and walk away with a clean TypeScript monorepo. Idiomatic, vendored code that’s yours the moment it lands.",
      path: "/",
    }),
  component: Page,
});

function Page() {
  const state = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          Build your stack, minus the pressure.
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Pick your modules and walk away with a clean TypeScript monorepo. Idiomatic, vendored code
          that’s yours the moment it lands. Add more modules or swap them out at any time.{" "}
          <Link
            to="/docs/$"
            params={{ _splat: "" }}
            className="text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Learn more…
          </Link>
        </p>
      </header>
      <Hydrate when={load()}>
        <Builder state={state} search={search} />
      </Hydrate>
    </div>
  );
}
