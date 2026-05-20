import type { Module, RegistryIndex } from "@stanza/registry";
import { createServerFn } from "@tanstack/react-start";

import { parseSelections, resolveSelectedAdapters, selectedFiles } from "@/lib/selection";
import type { BuilderSearch } from "@/lib/selection";
import { renderPreview, type Preview } from "@/server/highlighter";

const REGISTRY_BASE = process.env.STANZA_REGISTRY ?? "/registry";

export type BuilderState = {
  index: RegistryIndex;
  /** Keyed by `${slot}:${id}` for direct lookup. */
  modules: Record<string, Module>;
  /** Pre-rendered Shiki HTML, keyed by file path (relative to repo root). */
  previews: Record<string, Preview>;
  /** Ordered list of file paths derived from current selections. */
  filePaths: string[];
};

/**
 * Server function that powers the builder. Runs on every search-param change
 * via the route's `loaderDeps`. Pulls the registry, derives the selected file
 * list, and pre-renders Shiki HTML for each — keeping shiki off the client.
 */
export const getBuilderState = createServerFn({ method: "GET" })
  .inputValidator((data: BuilderSearch) => data)
  .handler(async ({ data }): Promise<BuilderState> => {
    const base = await resolveBase();

    const indexRes = await fetch(`${base}/index.json`);
    if (!indexRes.ok) {
      throw new Error(`Failed to load stanza registry index: ${indexRes.status}`);
    }
    const index = (await indexRes.json()) as RegistryIndex;

    // Fetch every module in parallel. The dataset is small (10s of KB at most)
    // and having everything client-side lets the user toggle slots without
    // extra roundtrips. The Shiki preview map is the only piece that changes
    // per-selection — recomputed each loader run.
    const fullModules = await Promise.all(
      index.modules.map(async (summary) => {
        const url = `${base}/modules/${summary.slot}-${summary.id}.json`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Module fetch failed: ${url} (${res.status})`);
        const mod = (await res.json()) as Module;
        return [`${mod.slot}:${mod.id}`, mod] as const;
      }),
    );
    const modules: Record<string, Module> = Object.fromEntries(fullModules);

    const { selections } = parseSelections(data);
    const resolved = resolveSelectedAdapters(modules, selections);
    const files = selectedFiles(resolved);

    const previewEntries = await Promise.all(
      files.map(async (file) => {
        const content = file.template.content ?? "";
        const preview = await renderPreview(content, file.path);
        return [file.path, preview] as const;
      }),
    );

    return {
      index,
      modules,
      previews: Object.fromEntries(previewEntries),
      filePaths: files.map((f) => f.path),
    };
  });

/**
 * `STANZA_REGISTRY` overrides the base. Without an override we hit the
 * same-domain `/registry/...` path served from `apps/web/public/registry/`.
 * In Node fetch we need an absolute URL — derive one from the request when
 * possible, fall back to localhost for dev.
 */
async function resolveBase(): Promise<string> {
  if (REGISTRY_BASE.startsWith("http")) return REGISTRY_BASE;
  // Server-rendering: convert the relative path to an absolute URL using the
  // incoming request. `getRequest()` is the TanStack Start server-side handle.
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const url = new URL(getRequest().url);
    return `${url.origin}${REGISTRY_BASE}`;
  } catch {
    // Fallback for non-request contexts (e.g. unit tests). Dev server default.
    return `http://localhost:3000${REGISTRY_BASE}`;
  }
}
