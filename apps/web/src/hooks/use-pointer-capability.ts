"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

const HOVER_QUERY = "(hover: hover)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";

type PointerCapability = {
  supportsHover: boolean;
  isCoarsePointer: boolean;
  isTouchDevice: boolean;
};

/**
 * Pointer-capability flags derived from `(hover)` + `(pointer)` media queries.
 * Defaults assume desktop (hover-capable, fine pointer) so SSR + first
 * hydration don't flag desktop users as touch; touch devices read the real
 * values on the first client render via `useSyncExternalStore`.
 */
export function usePointerCapability(): PointerCapability {
  const supportsHover = useMediaQuery(HOVER_QUERY, true);
  const isCoarsePointer = useMediaQuery(COARSE_POINTER_QUERY, false);

  return {
    supportsHover,
    isCoarsePointer,
    isTouchDevice: !supportsHover || isCoarsePointer,
  };
}
