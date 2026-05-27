import type { CategoryId, ModuleMetadata, RegistryIndex } from "@stanza/registry";
import { categoryLabel, KNOWN_CATEGORIES } from "@stanza/registry";
import { useMemo } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function metaKey(slot: CategoryId, id: string): string {
  return `${slot}:${id}`;
}

/**
 * Chip-row picker for each peer slot the detail page can switch on. Hides any
 * slot with fewer than 2 options — there's nothing to pick. The active value
 * is read from `resolvedPeers` so the UI reflects auto-defaults too.
 */
export function AdapterSwitcher({
  index,
  peerOptions,
  resolvedPeers,
  onChange,
}: {
  index: RegistryIndex;
  peerOptions: Partial<Record<CategoryId, string[]>>;
  resolvedPeers: Partial<Record<CategoryId, string>>;
  onChange: (category: CategoryId, id: string) => void;
}) {
  const switchable = useMemo(
    () =>
      KNOWN_CATEGORIES.flatMap((category): [CategoryId, string[]][] => {
        const opts = peerOptions[category];
        return opts && opts.length > 1 ? [[category, opts]] : [];
      }),
    [peerOptions],
  );

  // Pre-index metadata so the option-label lookup is O(1) instead of scanning
  // `index.modules` per option per slot per render.
  const metaIndex = useMemo(() => {
    const map = new Map<string, ModuleMetadata>();
    for (const m of index.modules) map.set(metaKey(m.category, m.id), m);
    return map;
  }, [index.modules]);

  if (switchable.length === 0) return null;

  return (
    <div className="space-y-3">
      {switchable.map(([slot, options]) => {
        const active = resolvedPeers[slot];
        return (
          <div key={slot} className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
              {categoryLabel(slot)}
            </span>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={active ? [active] : []}
              onValueChange={(value: string[]) => {
                const next = value[0];
                if (next) onChange(slot, next);
              }}
            >
              {options.map((id) => {
                const label = metaIndex.get(metaKey(slot, id))?.label ?? id;
                return (
                  <ToggleGroupItem
                    key={id}
                    value={id}
                    className="data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                  >
                    {label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>
        );
      })}
    </div>
  );
}
