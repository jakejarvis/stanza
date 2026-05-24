import type { Module, RegistryIndex } from "@stanza/registry";

import { reportServerError } from "@/server/posthog.server";
import { loadRegistryFile } from "@/server/registry-base.server";

let modulesPromise: Promise<Record<string, Module>> | undefined;

/**
 * Module-singleton cache for the full module catalog. Mirrors the
 * `getHighlighter()` pattern: load once per server instance, reuse across every
 * `getBuilderState` invocation. Registry data is immutable per deployment, so
 * cache lifetime = process lifetime (deploy-scoped on Vercel; restart the dev
 * server after `vp run registry:build` to pick up local edits).
 *
 * Per-module failures are isolated — the failing module is dropped from the
 * result and reported, the rest still resolve.
 */
export function getAllModules(index: RegistryIndex): Promise<Record<string, Module>> {
  if (!modulesPromise) modulesPromise = loadAll(index);
  return modulesPromise;
}

async function loadAll(index: RegistryIndex): Promise<Record<string, Module>> {
  const settled = await Promise.all(
    index.modules.map(async (summary): Promise<readonly [string, Module] | null> => {
      try {
        const mod = await loadRegistryFile<Module>(
          `modules/${summary.category}-${summary.id}.json`,
        );
        return [`${mod.category}:${mod.id}`, mod] as const;
      } catch (cause) {
        reportServerError(cause, {
          source: "getAllModules/loadModule",
          category: summary.category,
          moduleId: summary.id,
        });
        return null;
      }
    }),
  );
  return Object.fromEntries(
    settled.filter((entry): entry is readonly [string, Module] => entry !== null),
  );
}
