import { createServerFn } from "@tanstack/react-start";
import {
  synthesizeEnvExample,
  synthesizeManifest,
  synthesizePackageJsons,
  synthesizeReadme,
  synthesizeTemplates,
} from "@withstanza/registry";

import {
  DEFAULT_BUILDER_APPS,
  parseSelections,
  resolveSelected,
  selectedPeerIds,
  validateBuilderSearch,
} from "@/lib/selection";
import type { Preview } from "@/server/highlighter";
import { getHighlighter, renderPreview } from "@/server/highlighter.server";
import { getAllModules } from "@/server/registry-modules.server";

export type BuilderState = {
  /** Pre-rendered Shiki HTML, keyed by file path (relative to repo root). */
  previews: Record<string, Preview>;
  /** Ordered list of file paths derived from current selections. */
  filePaths: string[];
};

/**
 * Server function that powers the builder. Runs on every search-param change
 * via the route's `loaderDeps`. Pulls the registry, derives the selected file
 * list, and pre-renders Shiki HTML for each — keeping shiki off the client.
 *
 * The full hydrated module catalog stays server-side: the client reads
 * `ModuleMetadata[]` from the root route's loader for card rendering + peer
 * resolution, which is all it needs.
 */
export const getBuilderState = createServerFn({ method: "GET" })
  // Server functions are HTTP-reachable; share the route's allow-list so a
  // direct POST can't bypass it.
  .inputValidator(validateBuilderSearch)
  .handler(async ({ data }): Promise<BuilderState> => {
    // Warm the Shiki singleton during the initial empty-state load (which
    // renders zero previews and so would otherwise never touch the
    // highlighter). Fire-and-forget: the grammar/theme bundles load in the
    // background while the user reads the page, so the first slot toggle hits a
    // warm highlighter instead of paying ~hundreds of ms of cold-start.
    void getHighlighter();

    // Full module records are needed server-side for synth, but never shipped
    // to the client — that's the point of this server function.
    const modules = await getAllModules();

    const { name, pm, selections } = parseSelections(data);
    const resolved = resolveSelected(modules, selections);
    const peers = selectedPeerIds(selections);

    // Templates carry their own content; package.json, stanza.json, and
    // .env.example are synthesized — the CLI never ships them as templates, it
    // assembles them at apply time (merging deps/scripts/env, pinning the
    // manifest). Surface the same resolved files in the preview so the tree
    // matches what stanza actually writes. Only when something is selected, so
    // an empty builder still shows the empty state.
    const hasSelection = Object.values(resolved).some((entries) => (entries?.length ?? 0) > 0);
    // Single web app for now — the builder UX doesn't expose multi-app config
    // yet, but the registry's synth functions are already multi-app-shaped.
    const apps = [...DEFAULT_BUILDER_APPS];
    const previewFiles: { path: string; content: string }[] = synthesizeTemplates(resolved, {
      name,
      apps,
      packageManager: pm,
      peers,
    }).map((tpl) => ({ path: tpl.path, content: tpl.content }));
    if (hasSelection) {
      const pkgJsons = synthesizePackageJsons(resolved, { name, apps, packageManager: pm });
      for (const [path, pkg] of Object.entries(pkgJsons)) {
        previewFiles.push({ path, content: JSON.stringify(pkg, null, 2) + "\n" });
      }
      const manifest = synthesizeManifest(resolved, { name, apps, packageManager: pm });
      previewFiles.push({
        path: "stanza.json",
        content: JSON.stringify(manifest, null, 2) + "\n",
      });
      previewFiles.push({
        path: ".env.example",
        content: synthesizeEnvExample(resolved),
      });
      previewFiles.push({
        path: "README.md",
        content: synthesizeReadme(resolved, { name, apps, packageManager: pm, peers }),
      });
    }

    const previewEntries = await Promise.all(
      previewFiles.map(async (file) => {
        const preview = await renderPreview(file.content, file.path);
        return [file.path, preview] as const;
      }),
    );

    return {
      previews: Object.fromEntries(previewEntries),
      filePaths: previewFiles.map((f) => f.path),
    };
  });
