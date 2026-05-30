import type { PackageManager } from "@withstanza/schema";

/** Ordered list shown in the dropdown — pnpm first (the default). UI-only. */
export const PACKAGE_MANAGERS: { id: PackageManager; label: string }[] = [
  { id: "pnpm", label: "pnpm" },
  { id: "npm", label: "npm" },
  { id: "bun", label: "bun" },
];
