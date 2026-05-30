import { z } from "zod";

/**
 * Package managers Stanza scaffolds for. Persisted in `stanza.json`
 * (`packageManager`) and surfaced to templates as `{{pm}}`; pnpm is the
 * default. Closed enum so a manifest naming an unknown pm fails validation.
 */
export const PackageManagerSchema = z.enum(["pnpm", "bun", "npm"]);
export type PackageManager = z.infer<typeof PackageManagerSchema>;

/** Default when the caller doesn't pick one. */
export const DEFAULT_PACKAGE_MANAGER: PackageManager = "pnpm";

/** Narrowing guard for untrusted input (URL search params, env vars). */
export function isPackageManager(value: unknown): value is PackageManager {
  return PackageManagerSchema.safeParse(value).success;
}
