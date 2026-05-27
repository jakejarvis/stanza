import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Module, RegistryConfig, RegistryIndex, StanzaManifest } from "@stanza/registry";
import {
  CATEGORIES,
  DEFAULT_NAMESPACE,
  expandEnv,
  ModuleSchema,
  RegistryIndexSchema,
} from "@stanza/registry";

/**
 * The published Stanza website hosts the canonical first-party registry under
 * `/registry/`. The bundled CLI defaults to fetching from this URL when no
 * `STANZA_REGISTRY` env override and no in-repo dev registry is detected.
 */
const DEFAULT_REGISTRY_URL = "https://stanza.tools/registry";

// Cap every fetch so a slow/hung third-party registry can't stall the CLI
// (or block CI). Overridable for slow links + testing.
function defaultTimeoutMs(): number {
  const env = process.env.STANZA_HTTP_TIMEOUT_MS;
  const parsed = env ? Number.parseInt(env, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
}

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(defaultTimeoutMs()) });
}

/**
 * Multi-namespace registry surface used by every CLI command. The default
 * `@stanza` namespace is always present (resolved through the env-var →
 * local-FS → default-URL chain); additional namespaces come from the
 * project's `stanza.json` `registries` map.
 *
 * Unknown namespaces fail fast with a hard error to keep private module
 * names from accidentally leaking to a public registry — same rule shadcn
 * applies.
 */
export type Registries = {
  /** Every namespace this resolver knows about, including `@stanza`. */
  namespaces(): string[];
  /**
   * Fetch a module by category + id. `namespace` defaults to `@stanza`;
   * pass an explicit string (e.g. `"@acme"`) to route to a user-declared
   * registry. Throws when the namespace isn't configured.
   */
  loadModule(category: string, id: string, namespace?: string): Promise<Module>;
  /**
   * The default `@stanza` namespace's index — always present. Used by
   * `stanza init`, which never browses third-party registries.
   */
  defaultIndex(): RegistryIndex;
  /**
   * Namespaces that exposed a registry index, for fan-out `search`/`list`.
   * Namespaces without an `indexUrl` (or whose index 404s) are omitted —
   * they can still serve modules by name, just not by browse.
   */
  searchableIndices(): { namespace: string; index: RegistryIndex }[];
};

type NamespaceLoader = {
  index?: RegistryIndex;
  loadModule(category: string, id: string): Promise<Module>;
};

/**
 * Build a {@link Registries} instance for a project. Pass `manifest` to pick
 * up its declared `registries` map; omit it for project-less flows like
 * `stanza init` that only ever hit the default namespace.
 */
export async function loadRegistries(manifest?: StanzaManifest): Promise<Registries> {
  const customEntries = Object.entries(manifest?.registries ?? {}).filter(
    // Schema also forbids this; double-guard so a hand-edited manifest can't
    // shadow the default.
    ([ns]) => ns !== DEFAULT_NAMESPACE,
  );
  // Default + every custom loader in parallel. The default is critical (most
  // commands need it); custom loaders go through `Promise.allSettled` so one
  // broken third-party registry doesn't take down the rest of the CLI.
  const [defaultLoader, customResults] = await Promise.all([
    buildDefaultLoader(),
    Promise.allSettled(customEntries.map(([ns, cfg]) => buildCustomLoader(ns, cfg))),
  ]);

  const loaders = new Map<string, NamespaceLoader>();
  loaders.set(DEFAULT_NAMESPACE, defaultLoader);
  customEntries.forEach(([ns], i) => {
    const r = customResults[i]!;
    if (r.status === "fulfilled") {
      loaders.set(ns, r.value);
    } else {
      const detail = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.warn(`Registry "${ns}" failed to initialize — skipping: ${detail}`);
    }
  });

  return {
    namespaces: () => [...loaders.keys()],
    loadModule(category, id, namespace) {
      const ns = namespace ?? DEFAULT_NAMESPACE;
      const loader = loaders.get(ns);
      if (!loader) {
        throw new Error(`Unknown registry "${ns}". Add it to stanza.json under "registries".`);
      }
      return loader.loadModule(category, id);
    },
    defaultIndex() {
      const loader = loaders.get(DEFAULT_NAMESPACE)!;
      if (!loader.index) {
        throw new Error("Default Stanza registry returned no index.");
      }
      return loader.index;
    },
    searchableIndices() {
      const out: { namespace: string; index: RegistryIndex }[] = [];
      for (const [namespace, loader] of loaders) {
        if (loader.index) out.push({ namespace, index: loader.index });
      }
      return out;
    },
  };
}

/**
 * Locate the local first-party registry root for sourcing template/codemod
 * files. Only valid for the default `@stanza` namespace — third-party
 * namespaces ship template bodies inlined in their per-module JSON (the
 * registry build inlines `tpl.content`), so the runner never needs a disk
 * path for them.
 *
 * Returns `null` when no local registry is reachable (the typical published-
 * CLI case): callers must then rely on inlined `tpl.content` from the HTTP
 * loader. The runner handles this with a clear error if a template is missing
 * both inlined content and a registry root.
 */
export function pickRegistryRoot(namespace: string = DEFAULT_NAMESPACE): string | null {
  if (namespace !== DEFAULT_NAMESPACE) return null;
  const override = process.env.STANZA_REGISTRY;
  if (override && !override.startsWith("http")) return override;
  const local = resolveLocalRegistry();
  if (local) return local;
  return null;
}

function resolveLocalRegistry(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "registry", "modules");
    if (fs.existsSync(candidate)) return path.join(dir, "registry");
    dir = path.dirname(dir);
  }
  return undefined;
}

async function buildDefaultLoader(): Promise<NamespaceLoader> {
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

async function buildCustomLoader(namespace: string, cfg: RegistryConfig): Promise<NamespaceLoader> {
  const resolved = resolveConfig(cfg);
  // Try to grab an index up front; absent or 404 just means the namespace is
  // fetch-by-name only (won't appear in `searchableIndices`).
  const index = await tryFetchIndex(namespace, resolved);
  return {
    index,
    async loadModule(category, id) {
      const url = appendParams(renderModuleUrl(resolved, category, id), resolved.params);
      const init: RequestInit = { headers: buildHeaders(resolved.headers) };
      const res = await fetchWithTimeout(url, init);
      if (!res.ok) {
        throw new Error(`Module fetch failed: ${url} (${res.status} ${res.statusText})`);
      }
      return ModuleSchema.parse(await res.json());
    },
  };
}

type ResolvedConfig = {
  url: string;
  indexUrl?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
};

function resolveConfig(cfg: RegistryConfig): ResolvedConfig {
  if (typeof cfg === "string") {
    const base = cfg.replace(/\/+$/, "");
    return {
      url: `${base}/modules/{category}-{id}.json`,
      indexUrl: `${base}/index.json`,
    };
  }
  return cfg;
}

function renderModuleUrl(cfg: ResolvedConfig, category: string, id: string): string {
  return cfg.url.replaceAll("{category}", category).replaceAll("{id}", id);
}

const warnedHeaders = new Set<string>();

function buildHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [name, template] of Object.entries(headers)) {
    const value = expandEnv(template);
    if (value !== null) {
      out[name] = value;
    } else if (!warnedHeaders.has(name)) {
      // shadcn-style: drop the header rather than ship `Bearer ${TOKEN}` with
      // a literal placeholder. Warn once so it's debuggable when the registry
      // then returns 401.
      warnedHeaders.add(name);
      console.warn(`Registry header "${name}" dropped — env var in "${template}" is unset.`);
    }
  }
  return out;
}

function appendParams(url: string, params?: Record<string, string>): string {
  if (!params) return url;
  const u = new URL(url);
  for (const [name, template] of Object.entries(params)) {
    const value = expandEnv(template);
    if (value === null) {
      throw new Error(
        `Registry param "${name}" references an unset env var (template "${template}").`,
      );
    }
    u.searchParams.set(name, value);
  }
  return u.toString();
}

async function tryFetchIndex(
  namespace: string,
  cfg: ResolvedConfig,
): Promise<RegistryIndex | undefined> {
  if (!cfg.indexUrl) return undefined;
  let url: string;
  try {
    url = appendParams(cfg.indexUrl, cfg.params);
  } catch (err) {
    // appendParams throws on unset env vars — surface that since it's a
    // config error the user can fix, not a missing-index condition.
    console.warn(
      `Registry "${namespace}" index skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { headers: buildHeaders(cfg.headers) });
  } catch {
    // Network failure (DNS, offline, etc.) — the namespace stays
    // fetch-by-name-only this run. Silent: typical when offline.
    return undefined;
  }
  // 404 means "no index advertised" — legitimate for fetch-by-name-only
  // registries. Other non-OK statuses (401, 403, 5xx) likely indicate a
  // misconfiguration the user should see.
  if (res.status === 404) return undefined;
  if (!res.ok) {
    console.warn(`Registry "${namespace}" index returned ${res.status} ${res.statusText}.`);
    return undefined;
  }
  try {
    return RegistryIndexSchema.parse(await res.json());
  } catch (err) {
    // 200 but schema-invalid → config error worth telling the user about.
    const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.warn(`Registry "${namespace}" index is malformed: ${detail}`);
    return undefined;
  }
}

async function loadFsRegistry(rootDir: string): Promise<NamespaceLoader> {
  const modulesDir = path.join(rootDir, "modules");
  const ids = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  // Lazily import each module manifest. We don't keep them all in memory;
  // we strip the adapter payloads down to `key` + `match` for the index and
  // re-import full modules on demand.
  const summaries = await Promise.all(
    ids.map(async (name) => {
      const mod = await importModule(modulesDir, name);
      return { ...mod, adapters: mod.adapters.map((a) => ({ key: a.key, match: a.match })) };
    }),
  );

  const index: RegistryIndex = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    categories: [...CATEGORIES],
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

async function loadHttpRegistry(baseUrl: string): Promise<NamespaceLoader> {
  const indexRes = await fetchWithTimeout(`${baseUrl}/index.json`);
  if (!indexRes.ok) {
    throw new Error(`Failed to load Stanza registry from ${baseUrl}: ${indexRes.status}`);
  }
  const index = RegistryIndexSchema.parse(await indexRes.json());

  return {
    index,
    async loadModule(slot, id) {
      const url = `${baseUrl}/modules/${slot}-${id}.json`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`Module fetch failed: ${url} (${res.status})`);
      return ModuleSchema.parse(await res.json());
    },
  };
}

async function importModule(modulesDir: string, dirName: string): Promise<Module> {
  const entry = path.join(modulesDir, dirName, "module.ts");
  const mod: { default: Module } = await import(entry);
  if (!mod.default) {
    throw new Error(`Module ${dirName} has no default export at ${entry}`);
  }
  // Mirror `build.ts`: a sidecar `readme.md` next to `module.ts` is inlined
  // onto the manifest so the dev-time FS loader and the inlined-JSON loader
  // produce equivalent modules. Authors edit a real markdown file rather than
  // a string literal in `module.ts`.
  const readmeFile = path.join(modulesDir, dirName, "readme.md");
  if (fs.existsSync(readmeFile)) {
    return { ...mod.default, readme: fs.readFileSync(readmeFile, "utf8") };
  }
  return mod.default;
}
