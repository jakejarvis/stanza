import type { ModuleSummary, RegistryIndex, SlotId } from "@stanza/registry";
import { moduleGroup, slotLabel } from "@stanza/registry";

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
  peerOptions: Partial<Record<SlotId, string[]>>;
  resolvedPeers: Partial<Record<SlotId, string>>;
  onChange: (slot: SlotId, id: string) => void;
}) {
  const switchable = (Object.entries(peerOptions) as [SlotId, string[]][]).filter(
    ([, opts]) => opts.length > 1,
  );
  if (switchable.length === 0) return null;

  return (
    <div className="space-y-3">
      {switchable.map(([slot, options]) => {
        const active = resolvedPeers[slot];
        return (
          <div key={slot} className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
              {slotLabel(slot)}
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
                const summary = index.modules.find((m) => moduleGroup(m) === slot && m.id === id);
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
  slot: SlotId,
  id: string,
): ModuleSummary | undefined {
  return index.modules.find((m) => moduleGroup(m) === slot && m.id === id);
}
