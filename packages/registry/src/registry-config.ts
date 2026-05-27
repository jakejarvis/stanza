import { z } from "zod";

/**
 * Reserved namespace for first-party Stanza modules — the registry bundled
 * with the CLI (resolved through the env-var → local-FS → default-URL chain).
 * Other namespaces are declared by users in `stanza.json` under `registries`.
 */
export const DEFAULT_NAMESPACE = "@stanza" as const;

/**
 * Namespace keys mirror shadcn's regex — a leading `@`, then a single
 * scope-like word. Single-character scopes (`@a`) are not allowed; the
 * shape requires at least two trailing characters after the `@`.
 */
const NAMESPACE_RE = /^@[a-zA-Z0-9][a-zA-Z0-9-_]*[a-zA-Z0-9]$/;

const SPEC_RE = /^(@[a-zA-Z0-9][a-zA-Z0-9-_]*[a-zA-Z0-9])\/(.+)$/;

/**
 * Split a CLI module identifier. `"@acme/foo"` →
 * `{ namespace: "@acme", id: "foo" }`; a bare id → `{ id }` (default namespace
 * applies). The id portion may itself contain slashes.
 */
export function parseModuleSpec(spec: string): { namespace?: string; id: string } {
  const m = SPEC_RE.exec(spec);
  if (m) return { namespace: m[1]!, id: m[2]! };
  return { id: spec };
}

/** True when `value` is a syntactically valid namespace key. */
export function isNamespace(value: string): boolean {
  return NAMESPACE_RE.test(value);
}

/**
 * Replace `${VAR}` tokens with values from `env`. Returns `null` when any
 * referenced variable is unset, leaving the caller to react: header builders
 * drop the header (matches shadcn), URL builders treat it as an error.
 */
export function expandEnv(input: string, env: NodeJS.ProcessEnv = process.env): string | null {
  let missing = false;
  const result = input.replace(/\$\{(\w+)\}/g, (_, name: string) => {
    const v = env[name];
    if (v === undefined) {
      missing = true;
      return "";
    }
    return v;
  });
  return missing ? null : result;
}

const registryObjectSchema = z
  .object({
    /**
     * URL template — must include both `{category}` and `{id}` placeholders.
     * The CLI substitutes them per module fetch (e.g.
     * `https://reg.acme.com/{category}/{id}.json` → `.../testing/vitest.json`).
     */
    url: z.string().refine((s) => s.includes("{category}") && s.includes("{id}"), {
      message: "url must include both {category} and {id} placeholders",
    }),
    /**
     * Optional registry index URL. When set, `stanza search` includes this
     * namespace's catalog. Absent → the namespace is fetch-by-name only.
     */
    indexUrl: z.string().optional(),
    /**
     * Headers sent with every request to this registry. Values may contain
     * `${ENV_VAR}` tokens; a header whose template references an unset var
     * is silently omitted.
     */
    headers: z.record(z.string(), z.string()).optional(),
    /**
     * Query-string params appended to every request. Values may contain
     * `${ENV_VAR}` tokens; unset → request fails (the URL would be malformed).
     */
    params: z.record(z.string(), z.string()).optional(),
  })
  .strict();

/**
 * Shape of a registry entry in `stanza.json`. Either:
 *   - a bare URL prefix (uses Stanza's canonical layout — `{base}/index.json`
 *     and `{base}/modules/{category}-{id}.json`), or
 *   - a full object with a URL template + optional auth/params.
 */
export const RegistryConfigSchema = z.union([z.string(), registryObjectSchema]);

export type RegistryConfig = z.infer<typeof RegistryConfigSchema>;

/**
 * The `registries` field on a Stanza manifest. Keys are namespace strings
 * matching {@link NAMESPACE_RE}; values are {@link RegistryConfig} entries.
 * `@stanza` is reserved and rejected — the default namespace is configured
 * via the `STANZA_REGISTRY` env var, not the manifest.
 */
export const RegistriesSchema = z
  .record(z.string(), RegistryConfigSchema)
  .superRefine((rec, ctx) => {
    for (const key of Object.keys(rec)) {
      if (key === DEFAULT_NAMESPACE) {
        ctx.addIssue({
          code: "custom",
          message: `"${DEFAULT_NAMESPACE}" is reserved — set STANZA_REGISTRY to override the default registry`,
          path: [key],
        });
        continue;
      }
      if (!NAMESPACE_RE.test(key)) {
        ctx.addIssue({
          code: "custom",
          message: `registry key "${key}" must match @scope (letters, digits, dashes, underscores)`,
          path: [key],
        });
      }
    }
  });
