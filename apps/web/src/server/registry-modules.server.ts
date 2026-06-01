import type { Module, RegistryIndex } from "@withstanza/schema";

import { loadRegistryFile } from "@/server/registry-base.server";

let modulesPromise: Promise<Record<string, Module>> | undefined;

/**
 * Per-process cache for the full module catalog. Registry data is immutable
 * per deployment, so cache lifetime = process lifetime (restart the dev server
 * after the `compile-registry` task reruns to pick up local edits). Per-module
 * failures are isolated — the failing module is dropped and reported.
 */
export function getAllModules(): Promise<Record<string, Module>> {
  if (!modulesPromise) modulesPromise = loadAll();
  return modulesPromise;
}

async function loadAll(): Promise<Record<string, Module>> {
  const index = await loadRegistryFile<RegistryIndex>("index.json");
  const settled = await Promise.all(
    index.modules.map(async (meta): Promise<readonly [string, Module] | null> => {
      try {
        const mod = await loadRegistryFile<Module>(meta.path);
        return [`${mod.category}:${mod.id}`, mod] as const;
      } catch (cause) {
        console.error("[server-error]", cause, {
          source: "getAllModules/loadModule",
          category: meta.category,
          moduleId: meta.id,
        });
        return null;
      }
    }),
  );
  return Object.fromEntries(
    settled.filter((entry): entry is readonly [string, Module] => entry !== null),
  );
}
