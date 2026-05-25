import { useEffect, useRef, useState } from "react";

/**
 * Defer the truthy edge by `delayMs`, then hold true for at least `minMs`.
 *
 * Mirrors TanStack Router's `defaultPendingMs` / `defaultPendingMinMs`: wait
 * before showing a pending indicator (skip the flash for fast loads), and once
 * shown, keep it visible at least this long (avoid flicker on near-misses).
 */
export function useGracePeriod(active: boolean, delayMs: number, minMs: number): boolean {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef(0);

  useEffect(() => {
    if (active && !visible) {
      const t = setTimeout(() => {
        shownAtRef.current = performance.now();
        setVisible(true);
      }, delayMs);
      return () => clearTimeout(t);
    }
    if (!active && visible) {
      const remaining = Math.max(0, minMs - (performance.now() - shownAtRef.current));
      const t = setTimeout(() => setVisible(false), remaining);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [active, visible, delayMs, minMs]);

  return visible;
}
