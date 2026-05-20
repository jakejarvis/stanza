import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Module, RegistryIndex } from "@stanza/registry";
import { SLOTS } from "@stanza/registry";

/**
 * In dev (when running from the stanza monorepo), modules are imported
 * directly from `registry/modules/<id>/module.ts`. In production (published
 * CLI), the registry is a static JSON endpoint served by the canonical
 * stanza website — the web builder and CLI consume the same URL.
 *
 * Resolution order:
 *  1. `STANZA_REGISTRY` env var — explicit URL or filesystem path. Used by
 *     self-hosters and by CI to point at a local registry build.
 *  2. Local workspace at `../../registry` (the stanza monorepo dev case).
 *  3. The default published URL.
 */
const DEFAULT_REGISTRY_URL = "https://stanza.tools/registry";

export type Registry = {
  index: RegistryIndex;
  loadModule(slot: string, id: string): Promise<Module>;
};

export async function loadRegistry(): Promise<Registry> {
  const envOverride = process.env.STANZA_REGISTRY;
  if (envOverride) {
    return envOverride.startsWith("http")
      ? loadHttpRegistry(envOverride)
      : loadFsRegistry(envOverride);
  }

  const localPath = resolveLocalRegistry();
  if (localPath) return loadFsRegistry(localPath);

  return loadHttpRegistry(DEFAULT_REGISTRY_URL);
}

function resolveLocalRegistry(): string | undefined {
  // When running from `apps/cli/src/bin.ts`, walk up until we find a sibling
  // `registry/modules/` dir — the dev-time monorepo layout.
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "registry", "modules");
    if (fs.existsSync(candidate)) return path.join(dir, "registry");
    dir = path.dirname(dir);
  }
  return undefined;
}

/**
 * Locate the registry root on disk for sourcing template/codemod files.
 * Mirrors `loadRegistry`'s local-path resolution:
 *   1. `STANZA_REGISTRY` env var if it points at a filesystem path.
 *   2. Walk up from this file looking for a sibling `registry/modules/` dir.
 *
 * Throws if neither resolves. Used by command handlers (`init`, `add`) that
 * need to read template source files alongside the registry index.
 */
export function pickRegistryRoot(): string {
  const override = process.env.STANZA_REGISTRY;
  if (override && !override.startsWith("http")) return override;
  const local = resolveLocalRegistry();
  if (local) return local;
  throw new Error("Could not locate stanza registry root.");
}

async function loadFsRegistry(rootDir: string): Promise<Registry> {
  const modulesDir = path.join(rootDir, "modules");
  const ids = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  // Lazily import each module manifest. We don't keep them all in memory;
  // we keep summaries for the index and re-import full modules on demand.
  const summaries = await Promise.all(
    ids.map(async (name) => {
      const mod = await importModule(modulesDir, name);
      return summarize(mod);
    }),
  );

  const index: RegistryIndex = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    slots: SLOTS.map((s) => ({ ...s })),
    modules: summaries,
  };

  return {
    index,
    async loadModule(_slot, id) {
      // Modules are stored as `<slot>-<id>` directories. We accept either the
      // bare id (preferred) or the slot-prefixed dir name.
      const dirName = ids.find((d) => d === id || d.endsWith(`-${id}`) || d === `${_slot}-${id}`);
      if (!dirName) {
        throw new Error(`Module not found in local registry: ${_slot}/${id}`);
      }
      return importModule(modulesDir, dirName);
    },
  };
}

async function loadHttpRegistry(baseUrl: string): Promise<Registry> {
  const indexRes = await fetch(`${baseUrl}/index.json`);
  if (!indexRes.ok) {
    throw new Error(`Failed to load stanza registry from ${baseUrl}: ${indexRes.status}`);
  }
  const index = (await indexRes.json()) as RegistryIndex;

  return {
    index,
    async loadModule(slot, id) {
      const url = `${baseUrl}/modules/${slot}-${id}.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Module fetch failed: ${url} (${res.status})`);
      return (await res.json()) as Module;
    },
  };
}

async function importModule(modulesDir: string, dirName: string): Promise<Module> {
  const entry = path.join(modulesDir, dirName, "module.ts");
  const mod = (await import(entry)) as { default: Module };
  if (!mod.default) {
    throw new Error(`Module ${dirName} has no default export at ${entry}`);
  }
  return mod.default;
}

function summarize(mod: Module) {
  return {
    ...mod,
    adapters: mod.adapters.map((a) => ({ key: a.key, match: a.match })),
  };
}

