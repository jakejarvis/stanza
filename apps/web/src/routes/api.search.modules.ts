import { create, insert, search } from "@orama/orama";
import type { Module, ModuleSummary, RegistryIndex } from "@stanza/registry";
import { createFileRoute } from "@tanstack/react-router";
import { cache } from "react";

import { loadRegistryFile } from "@/server/registry-base.server";

const moduleSchema = {
  category: "string",
  moduleId: "string",
  label: "string",
  description: "string",
  // Joined text for full-text matching. These fields never travel back to the
  // client — only `summaries[hit.id]` does, which is `ModuleSummary`-shaped.
  deps: "string",
  envNames: "string",
  envDescriptions: "string",
} as const;

type ModuleIndex = {
  db: ReturnType<typeof create<typeof moduleSchema>>;
  summaries: Map<string, ModuleSummary>;
};

// React `cache()` dedupes the (async) build across any concurrent callers
// within the same server render. The returned promise is reused on warm
// calls so the registry-load + Orama-insert work only runs once.
const getModuleIndex = cache((): Promise<ModuleIndex> => buildIndex());

async function buildIndex(): Promise<ModuleIndex> {
  const index = await loadRegistryFile<RegistryIndex>("index.json");
  const db = create({ schema: moduleSchema });
  const summaries = new Map<string, ModuleSummary>();

  // Per-module file missing (shouldn't happen for first-party modules, but
  // be tolerant): fall back to summary-only indexing via `mod: null`.
  const loaded = await Promise.all(
    index.modules.map(async (summary) => {
      try {
        const mod = await loadRegistryFile<Module>(
          `modules/${summary.category}-${summary.id}.json`,
        );
        return { summary, mod };
      } catch {
        return { summary, mod: null as Module | null };
      }
    }),
  );

  const inserted = await Promise.all(
    loaded.map(async ({ summary, mod }) => {
      const deps = new Set<string>();
      const envNames = new Set<string>();
      const envDescriptions: string[] = [];
      if (mod) {
        for (const k of Object.keys(mod.dependencies ?? {})) deps.add(k);
        for (const k of Object.keys(mod.devDependencies ?? {})) deps.add(k);
        for (const e of mod.env ?? []) {
          envNames.add(e.name);
          if (e.description) envDescriptions.push(e.description);
        }
        for (const adapter of mod.adapters) {
          for (const k of Object.keys(adapter.dependencies ?? {})) deps.add(k);
          for (const k of Object.keys(adapter.devDependencies ?? {})) deps.add(k);
          for (const e of adapter.env ?? []) {
            envNames.add(e.name);
            if (e.description) envDescriptions.push(e.description);
          }
        }
      }

      const id = await insert(db, {
        category: summary.category,
        moduleId: summary.id,
        label: summary.label,
        description: summary.description,
        deps: [...deps].join(" "),
        envNames: [...envNames].join(" "),
        envDescriptions: envDescriptions.join(" "),
      });
      return { id, summary };
    }),
  );
  for (const { id, summary } of inserted) summaries.set(id, summary);

  return { db, summaries };
}

/**
 * `GET /api/search/modules?q=…` — server-side module search. Builds an Orama
 * index from the full module data (deps, env vars, descriptions) so we can
 * match on richer fields than the client ever sees. Only `ModuleSummary`-
 * shaped hits travel back, which means we can index README bodies later
 * without bloating any client payload.
 *
 * Empty query returns an empty array — the client renders all modules from
 * the registry summary it already has from the root loader.
 */
export const Route = createFileRoute("/api/search/modules")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const q = url.searchParams.get("q") ?? "";
          if (!q) return Response.json({ results: [] });

          const { db, summaries } = await getModuleIndex();
          const hits = await search(db, { term: q, limit: 50 });

          const results: ModuleSummary[] = [];
          for (const hit of hits.hits) {
            const summary = summaries.get(hit.id);
            if (summary) results.push(summary);
          }
          return Response.json({ results });
        } catch (error) {
          console.error("[server-error]", error, { source: "/api/search/modules" });
          return Response.json(
            { error: "Search failed", code: "MODULES_SEARCH_FAILED" },
            { status: 500 },
          );
        }
      },
    },
  },
});
