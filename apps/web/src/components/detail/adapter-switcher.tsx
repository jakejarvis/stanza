import type { CategoryId, ModuleSummary, RegistryIndex } from "@stanza/registry";
import { categoryLabel, KNOWN_CATEGORIES } from "@stanza/registry";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
  const switchable = KNOWN_CATEGORIES.flatMap((category): [CategoryId, string[]][] => {
    const opts = peerOptions[category];
    return opts && opts.length > 1 ? [[category, opts]] : [];
  });
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
                const summary = index.modules.find((m) => m.category === slot && m.id === id);
                const label = summary?.label ?? id;
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

export function summaryFor(
  index: RegistryIndex,
  slot: CategoryId,
  id: string,
): ModuleSummary | undefined {
  return index.modules.find((m) => m.category === slot && m.id === id);
}
