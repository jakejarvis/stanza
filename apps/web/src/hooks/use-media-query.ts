import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 *
 * `matchMedia` is client-only, so the first (server + hydration) render uses
 * `defaultValue`; the real value is read on mount. Pass the default that
 * matches your most common environment to minimize the post-hydration flip
 * (e.g. `true` for a desktop-first `min-width` query).
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
