export type PackageManager = "pnpm" | "npm" | "bun";

/** Ordered list shown in the dropdown — pnpm first (the default). */
export const PACKAGE_MANAGERS: { id: PackageManager; label: string }[] = [
  { id: "pnpm", label: "pnpm" },
  { id: "npm", label: "npm" },
  { id: "bun", label: "bun" },
];

export const DEFAULT_PACKAGE_MANAGER: PackageManager = "pnpm";

export function isPackageManager(value: string | null | undefined): value is PackageManager {
  return PACKAGE_MANAGERS.some((pm) => pm.id === value);
}
