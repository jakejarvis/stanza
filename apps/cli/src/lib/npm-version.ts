import semver from "semver";

const NPM_REGISTRY = process.env.STANZA_NPM_REGISTRY ?? "https://registry.npmjs.org";

// pkg name -> available versions, or null when a prior lookup failed. Lives for
// the CLI process so a multi-module `init` hits npm at most once per package.
const cache = new Map<string, string[] | null>();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `"^"`/`"~"` for shapes we re-resolve; `null` means leave the range verbatim. */
function rangeModifier(range: string): "^" | "~" | null {
  const t = range.trim();
  if (/^\^\d/.test(t)) return "^";
  if (/^~\d/.test(t)) return "~";
  // exact pins, comparators, `||`, x-ranges, workspace:/file:/npm: specs, tags
  return null;
}

function encodeName(name: string): string {
  // Scoped names keep their leading `@`; only the `/` needs encoding.
  return name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
}

async function fetchVersions(name: string): Promise<string[] | null> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(`${NPM_REGISTRY}/${encodeName(name)}`, {
      // Abbreviated packument — smaller payload, version keys are all we need.
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    if (!res.ok) {
      cache.set(name, null);
      return null;
    }
    const body: unknown = await res.json();
    const versionsMap = isObject(body) && isObject(body.versions) ? body.versions : {};
    const versions = Object.keys(versionsMap);
    cache.set(name, versions);
    return versions;
  } catch {
    cache.set(name, null);
    return null;
  }
}

/**
 * Resolve a single `(name, range)` to the latest published version satisfying
 * `range`, re-attaching the original modifier (`^1.6.11` → `^1.8.3`). Falls back
 * to the input range when lookups are disabled, the shape isn't a `^`/`~` range,
 * npm is unreachable, or nothing satisfies the range.
 */
export async function resolveRange(name: string, range: string): Promise<string> {
  if (process.env.STANZA_NO_NPM_LOOKUP) return range;
  const modifier = rangeModifier(range);
  if (modifier === null) return range;
  const versions = await fetchVersions(name);
  if (!versions) return range;
  const max = semver.maxSatisfying(versions, range, { includePrerelease: false });
  return max ? `${modifier}${max}` : range;
}

/** Resolve a whole `name -> range` map in parallel; failures fall back per-entry. */
export async function resolveRanges(deps: Record<string, string>): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.entries(deps).map(
      async ([name, range]) => [name, await resolveRange(name, range)] as const,
    ),
  );
  return Object.fromEntries(entries);
}

/** Test-only: drop the process-lifetime cache so cases don't bleed into each other. */
export function clearVersionCacheForTests(): void {
  cache.clear();
}
