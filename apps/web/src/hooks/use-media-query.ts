import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 *
 * `useSyncExternalStore` reads the real match value during the initial client
 * sync — no `useEffect`-after-paint flip. SSR + the very first hydration pass
 * return `defaultValue`; pick one that matches your most common environment to
 * minimize the post-hydration flip (e.g. `true` for a desktop-first `min-width`
 * query).
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  // Memoize `subscribe` and `getSnapshot` so React doesn't re-subscribe on
  // every render (identity-driven, per `useSyncExternalStore`'s contract).
  const subscribe = useCallback(
    (callback: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
