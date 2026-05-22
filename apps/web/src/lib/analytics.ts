import { KNOWN_SLOTS } from "@stanza/registry";
import { usePostHog } from "posthog-js/react";
import { useCallback } from "react";

import type { AddonSelections, Selections } from "@/lib/selection";

/**
 * Stable `capture(event, properties)` bound to the client-side PostHog instance.
 * Safe to call unconditionally: when no key is configured the singleton is
 * uninitialized and `capture` is a no-op.
 */
export function useAnalytics(): (event: string, properties?: Record<string, unknown>) => void {
  const posthog = usePostHog();
  return useCallback(
    (event, properties) => {
      // oxlint-disable-next-line no-underscore-dangle
      if (!posthog.__loaded) return;
      posthog.capture(event, properties);
    },
    [posthog],
  );
}

/**
 * Flatten the current builder selection into event properties: one key per slot
 * (`framework`, `db`, …) plus an `addons` array. Shared across the builder
 * events so they all carry the same selection shape.
 */
export function selectionProperties(
  selections: Selections,
  addons: AddonSelections,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const slot of KNOWN_SLOTS) props[slot] = selections[slot] ?? null;
  props.addons = Object.entries(addons).flatMap(([category, ids]) =>
    (ids ?? []).map((id) => `${category}:${id}`),
  );
  return props;
}
