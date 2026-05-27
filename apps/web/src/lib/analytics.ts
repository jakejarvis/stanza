import { KNOWN_CATEGORIES } from "@stanza/registry";

import type { Selections } from "@/lib/selection";

/**
 * Flatten the current builder selection into event properties: one key per
 * category, holding the comma-joined selected ids (empty → null). Shared across
 * the builder events so they all carry the same selection shape.
 */
export function selectionProperties(selections: Selections): Record<string, string | null> {
  const props: Record<string, string | null> = {};
  for (const category of KNOWN_CATEGORIES) {
    const ids = selections[category];
    props[category] = ids && ids.length > 0 ? ids.join(",") : null;
  }
  return props;
}
