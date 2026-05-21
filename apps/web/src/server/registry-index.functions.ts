import type { RegistryIndex } from "@stanza/registry";
import { createServerFn } from "@tanstack/react-start";

import { loadRegistryFile } from "@/server/registry-base.server";

/**
 * Lightweight read of just the registry index (`index.json`). Wired into the
 * root route loader so every page can read it from `useLoaderData({ from: "__root__" })`
 * without re-fetching — the index is small (~10 KB) and a single read per
 * navigation is plenty for the header search and per-route SEO/OG.
 */
export const getRegistryIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<RegistryIndex> => {
    return loadRegistryFile<RegistryIndex>("index.json");
  },
);
