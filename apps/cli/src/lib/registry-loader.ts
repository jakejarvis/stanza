import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Module, RegistryConfig, RegistryIndex, StanzaManifest } from "@withstanza/schema";
import {
  DEFAULT_NAMESPACE,
  expandEnv,
  ModuleSchema,
  RegistryIndexSchema,
} from "@withstanza/schema";

import { assertSecureFetchUrl } from "./secure-url";

/**
 * The published Stanza website hosts the canonical first-party registry. A
 * registry is addressed by the full URL to its **main JSON file** (the index);
 * the bundled CLI defaults to this one when `STANZA_REGISTRY` is unset.
 */
const DEFAULT_REGISTRY_URL = "https://stanza.tools/registry/index.json";

// Cap every fetch so a slow/hung registry can't stall the CLI (or block CI).
// Overridable for slow links + testing.
function defaultTimeoutMs(): number {
  const env = process.env.STANZA_HTTP_TIMEOUT_MS;
  const parsed = env ? Number.parseInt(env, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
}

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(defaultTimeoutMs()) });
}

/** Per-registry HTTP options (ignored for filesystem URIs). */
type FetchOpts = { headers?: Record<string, string>; params?: Record<string, string> };

/**
 * Multi-namespace registry surface used by every CLI command. The default
 * `@stanza` namespace is always present (its main file resolved through the
 * env-var → default-URL chain); additional namespaces come from the project's
 * `stanza.json` `registries` map.
 *
 * Unknown namespaces fail fast with a hard error to keep private module names
 * from accidentally leaking to a public registry — same rule shadcn applies.
 */
export type Registries = {
  /** Every namespace this resolver knows about, including `@stanza`. */
  namespaces(): string[];
  /**
   * Fetch a module by category + id. `namespace` defaults to `@stanza`; pass an
   * explicit string (e.g. `"@acme"`) to route to a user-declared registry.
   * Throws when the namespace isn't configured.
   */
  loadModule(category: string, id: string, namespace?: string): Promise<Module>;
  /** The default `@stanza` namespace's index — always present. */
  defaultIndex(): RegistryIndex;
  /** Every namespace's index, for fan-out `search`/`list`. */
  searchableIndices(): { namespace: string; index: RegistryIndex }[];
};

type NamespaceLoader = {
  index: RegistryIndex;
  loadModule(category: string, id: string): Promise<Module>;
};

/**
 * Build a {@link Registries} instance for a project. Pass `manifest` to pick up
 * its declared `registries` map; omit it for project-less flows like
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
    Promise.allSettled(customEntries.map(([, cfg]) => buildCustomLoader(cfg))),
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
      return loaders.get(DEFAULT_NAMESPACE)!.index;
    },
    searchableIndices() {
      return [...loaders].map(([namespace, loader]) => ({ namespace, index: loader.index }));
    },
  };
}

function buildDefaultLoader(): Promise<NamespaceLoader> {
  const override = process.env.STANZA_REGISTRY;
  return loadRegistry(override && override.length > 0 ? override : DEFAULT_REGISTRY_URL, {});
}

function buildCustomLoader(cfg: RegistryConfig): Promise<NamespaceLoader> {
  const { url, headers, params } = typeof cfg === "string" ? { url: cfg } : cfg;
  return loadRegistry(url, { headers, params });
}

/**
 * The one and only registry loader. `mainUri` is the full URL/path to the
 * registry's main JSON file (the index) — never a directory or a base. Each
 * module's `path` recorded in that file is resolved relative to `mainUri`,
 * over `http(s)://` or the filesystem (bare path or `file://`), identically.
 */
async function loadRegistry(mainUri: string, opts: FetchOpts): Promise<NamespaceLoader> {
  // Refuse cleartext http:// before the try so the scheme error isn't wrapped
  // in the misleading "not a directory" frame below.
  assertSecureFetchUrl(mainUri, "Registry URL");
  let text: string;
  try {
    text = await readText(mainUri, opts);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not load the registry main file at "${mainUri}". It must be the full ` +
        `path/URL to the registry's main JSON file (not a directory). ${detail}`,
      { cause: err },
    );
  }
  const index = RegistryIndexSchema.parse(JSON.parse(text));

  return {
    index,
    async loadModule(category, id) {
      const entry = index.modules.find((m) => m.category === category && m.id === id);
      if (!entry) {
        throw new Error(`Module not found in registry: ${category}/${id}`);
      }
      const moduleUri = resolveModuleUri(mainUri, entry.path);
      // Backstop a malicious index that downgrades an https index to an
      // absolute http:// module URL (`new URL` would honor the cross-origin host).
      assertSecureFetchUrl(moduleUri, "Registry module URL");
      const body = await readText(moduleUri, opts);
      return ModuleSchema.parse(JSON.parse(body));
    },
  };
}

function isHttp(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://");
}

function toFsPath(uri: string): string {
  return uri.startsWith("file://") ? fileURLToPath(uri) : uri;
}

/** Resolve a module's relative `path` against the main file's URI. */
function resolveModuleUri(mainUri: string, relPath: string): string {
  if (isHttp(mainUri)) return new URL(relPath, mainUri).toString();
  return path.resolve(path.dirname(toFsPath(mainUri)), relPath);
}

/** Read a registry resource as text — HTTP fetch or filesystem read. */
async function readText(uri: string, opts: FetchOpts): Promise<string> {
  if (isHttp(uri)) {
    const url = appendParams(uri, opts.params);
    const res = await fetchWithTimeout(url, { headers: buildHeaders(opts.headers) });
    if (!res.ok) {
      throw new Error(`fetch failed: ${url} (${res.status} ${res.statusText})`);
    }
    return res.text();
  }
  return fs.readFileSync(toFsPath(uri), "utf8");
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
      // shadcn-style: drop the header rather than ship `Bearer ${TOKEN}` with a
      // literal placeholder. Warn once so it's debuggable when the registry
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
