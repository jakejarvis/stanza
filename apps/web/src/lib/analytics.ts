import { KNOWN_CATEGORIES } from "@stanza/registry";
import { usePostHog } from "posthog-js/react";
import { useCallback } from "react";

import type { Selections } from "@/lib/selection";

/**
 * Stable `capture(event, properties)` bound to the client-side PostHog instance.
 * Safe to call unconditionally: when no key is configured the singleton is
 * uninitialized and `capture` is a no-op.
 */
export function useAnalytics(): (event: string, properties?: Record<string, unknown>) => void {
  const posthog = usePostHog();
  return useCallback(
    (event, properties) => {
      if (!posthog.__loaded) return;
      posthog.capture(event, properties);
    },
    [posthog],
  );
}

/**
 * Flatten the current builder selection into event properties: one key per
 * category, holding the comma-joined selected ids (empty → null). Shared across
 * the builder events so they all carry the same selection shape.
 */
export function selectionProperties(selections: Selections): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const category of KNOWN_CATEGORIES) {
    const ids = selections[category];
    props[category] = ids && ids.length > 0 ? ids.join(",") : null;
  }
  return props;
}
