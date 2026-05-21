import type { Module, RegistryIndex } from "@stanza/registry";
import { moduleGroup } from "@stanza/registry";
import { createServerFn } from "@tanstack/react-start";

import {
  parseSelections,
  resolveSelectedAdapters,
  resolveSelectedAddons,
  selectedFiles,
} from "@/lib/selection";
import type { BuilderSearch } from "@/lib/selection";
import type { Preview } from "@/server/highlighter";
import { renderPreview } from "@/server/highlighter.server";
import { loadRegistryFile } from "@/server/registry-base.server";

export type BuilderState = {
  index: RegistryIndex;
  /** Keyed by `${slotOrCategory}:${id}` for direct lookup. */
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
    const index = await loadRegistryFile<RegistryIndex>("index.json");

    // Load every module in parallel. The dataset is small (10s of KB at most)
    // and having everything client-side lets the user toggle slots without
    // extra roundtrips. The Shiki preview map is the only piece that changes
    // per-selection — recomputed each loader run.
    const fullModules = await Promise.all(
      index.modules.map(async (summary) => {
        const group = moduleGroup(summary);
        const mod = await loadRegistryFile<Module>(`modules/${group}-${summary.id}.json`);
        return [`${moduleGroup(mod)}:${mod.id}`, mod] as const;
      }),
    );
    const modules: Record<string, Module> = Object.fromEntries(fullModules);

    const { selections, addons } = parseSelections(data);
    const resolved = resolveSelectedAdapters(modules, selections);
    const resolvedAddons = resolveSelectedAddons(modules, selections, addons);
    const files = selectedFiles(resolved, resolvedAddons);

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
