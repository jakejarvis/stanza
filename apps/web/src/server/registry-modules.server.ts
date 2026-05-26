import type { Module, RegistryIndex } from "@stanza/registry";

import { reportServerError } from "@/server/posthog.server";
import { loadRegistryFile } from "@/server/registry-base.server";

let modulesPromise: Promise<Record<string, Module>> | undefined;

/**
 * Per-process cache for the full module catalog. Registry data is immutable
 * per deployment, so cache lifetime = process lifetime (restart the dev server
 * after `vp run @stanza/web#prebuild` to pick up local edits). Per-module
 * failures are isolated — the failing module is dropped and reported.
 */
export function getAllModules(): Promise<Record<string, Module>> {
  if (!modulesPromise) modulesPromise = loadAll();
  return modulesPromise;
}

async function loadAll(): Promise<Record<string, Module>> {
  const index = await loadRegistryFile<RegistryIndex>("index.json");
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
