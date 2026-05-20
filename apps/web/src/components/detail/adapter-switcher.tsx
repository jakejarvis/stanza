import type { ModuleSummary, RegistryIndex, SlotId } from "@stanza/registry";
import { slotLabel } from "@stanza/registry";

import { cn } from "@/lib/utils";

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
            <div className="flex flex-wrap gap-1.5">
              {options.map((id) => {
                const summary = index.modules.find((m) => m.slot === slot && m.id === id);
                const label = summary?.label ?? id;
                const isActive = active === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange(slot, id)}
                    aria-pressed={isActive}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-none border px-2.5 py-1 text-xs transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      isActive
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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
  return index.modules.find((m) => m.slot === slot && m.id === id);
}
