import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { RegistryIndex } from "@stanza/registry";
import { Builder } from "~/components/builder.tsx";

const getRegistryIndex = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.STANZA_REGISTRY ?? "https://stanza.dev/registry";
  const res = await fetch(`${url}/index.json`);
  if (!res.ok) {
    throw new Error(`Failed to load stanza registry: ${res.status}`);
  }
  return (await res.json()) as RegistryIndex;
});

export const Route = createFileRoute("/")({
  loader: () => getRegistryIndex(),
  component: Page,
});

function Page() {
  const index = Route.useLoaderData();
  return (
    <main style={{ maxWidth: "48rem", margin: "4rem auto", padding: "0 1rem" }}>
      <h1>stanza</h1>
      <p>Pick your stack. Get an idiomatic monorepo.</p>
      <Builder index={index} />
    </main>
  );
}
