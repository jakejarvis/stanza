import { useCallback, useSyncExternalStore } from "react";

export type PackageManager = "pnpm" | "npm" | "bun" | "yarn";

/** Ordered list shown in the dropdown — pnpm first (the default). */
export const PACKAGE_MANAGERS: { id: PackageManager; label: string }[] = [
  { id: "pnpm", label: "pnpm" },
  { id: "npm", label: "npm" },
  { id: "bun", label: "bun" },
  { id: "yarn", label: "yarn" },
];

export const DEFAULT_PACKAGE_MANAGER: PackageManager = "pnpm";

const STORAGE_KEY = "stanza-package-manager";

function isPackageManager(value: string | null): value is PackageManager {
  return PACKAGE_MANAGERS.some((pm) => pm.id === value);
}

// A single shared store so every command preview on the page (the builder
// renders one for mobile and one for desktop) reflects the same choice and
// updates together, rather than each holding independent state.
const listeners = new Set<() => void>();
let current: PackageManager | null = null;

function read(): PackageManager {
  if (current === null) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      current = isPackageManager(stored) ? stored : DEFAULT_PACKAGE_MANAGER;
    } catch {
      current = DEFAULT_PACKAGE_MANAGER;
    }
  }
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    current = isPackageManager(e.newValue) ? e.newValue : DEFAULT_PACKAGE_MANAGER;
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Persisted package-manager preference. SSR and the first client (hydration)
 * render use the default via `getServerSnapshot` so the markup matches; the
 * stored value is adopted right after, avoiding a hydration mismatch on the
 * rendered command string.
 */
export function usePackageManager(): {
  pm: PackageManager;
  setPm: (next: PackageManager) => void;
} {
  const pm = useSyncExternalStore(subscribe, read, () => DEFAULT_PACKAGE_MANAGER);

  const setPm = useCallback((next: PackageManager) => {
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — preference just won't persist
    }
    listeners.forEach((l) => l());
  }, []);

  return { pm, setPm };
}
