import type {
  AddonCategoryId,
  Module,
  ModuleSummary,
  ResolveError,
  SlotId,
} from "@stanza/registry";
import {
  emptyManifest,
  groupLabel,
  KNOWN_ADDONS,
  KNOWN_SLOTS,
  moduleGroup,
  resolveAdapter,
  slotLabel,
} from "@stanza/registry";
import { IconCheck } from "@tabler/icons-react";
import { useCallback } from "react";

import { ModuleLogo } from "@/components/module-logo";
import type { AddonSelections, Selections } from "@/lib/selection";
import { cn } from "@/lib/utils";

export function SlotCards({
  modules,
  summaries,
  selections,
  addonSelections,
  onSelect,
  onToggleAddon,
}: {
  modules: Record<string, Module>;
  summaries: ModuleSummary[];
  selections: Selections;
  addonSelections: AddonSelections;
  onSelect: (slot: SlotId, id: string | undefined) => void;
  onToggleAddon: (category: AddonCategoryId, id: string) => void;
}) {
  // Shared peer context: the chosen slot modules. Both slot and add-on cards
  // resolve compatibility against this.
  const pending: Partial<Record<SlotId, Module>> = {};
  for (const s of KNOWN_SLOTS) {
    const id = selections[s];
    if (id && modules[`${s}:${id}`]) pending[s] = modules[`${s}:${id}`];
  }

  // Only render add-on categories that actually have modules in the registry.
  const addonCategories = KNOWN_ADDONS.filter((c) => summaries.some((m) => moduleGroup(m) === c));

  return (
    <div className="space-y-8">
      {KNOWN_SLOTS.map((slot, index) => (
        <ModuleSection
          key={slot}
          group={slot}
          summaries={summaries}
          modulesById={modules}
          pending={pending}
          index={index + 1}
          multi={false}
          isSelected={(m) => selections[slot] === m.id}
          onActivate={(m, selected) => onSelect(slot, selected ? undefined : m.id)}
        />
      ))}
      {addonCategories.map((category, i) => (
        <ModuleSection
          key={category}
          group={category}
          summaries={summaries}
          modulesById={modules}
          pending={pending}
          index={KNOWN_SLOTS.length + i + 1}
          multi
          isSelected={(m) => Boolean(addonSelections[category]?.includes(m.id))}
          onActivate={(m) => onToggleAddon(category, m.id)}
        />
      ))}
    </div>
  );
}

function ModuleSection({
  group,
  summaries,
  modulesById,
  pending,
  index,
  multi,
  isSelected,
  onActivate,
}: {
  group: SlotId | AddonCategoryId;
  summaries: ModuleSummary[];
  modulesById: Record<string, Module>;
  pending: Partial<Record<SlotId, Module>>;
  index: number;
  multi: boolean;
  isSelected: (m: ModuleSummary) => boolean;
  onActivate: (m: ModuleSummary, selected: boolean) => void;
}) {
  const modules = summaries.filter((m) => moduleGroup(m) === group);
  if (modules.length === 0) return null;

  const manifest = emptyManifest({ name: "t" });
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {String(index).padStart(2, "0")}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{groupLabel(group)}</h2>
        {multi && <span className="text-xs text-muted-foreground">{"· choose any"}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modules.map((m) => {
          const full = modulesById[`${moduleGroup(m)}:${m.id}`];
          const result = full ? resolveAdapter(full, { manifest, pending }) : undefined;
          const disabled = !result?.ok;
          const selected = isSelected(m);
          const reason = result && !result.ok ? describeError(result.error) : undefined;
          return (
            <ModuleCard
              key={m.id}
              module={m}
              selected={selected}
              disabled={disabled}
              reason={reason}
              onActivate={() => onActivate(m, selected)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ModuleCard({
  module: m,
  selected,
  disabled,
  reason,
  onActivate,
}: {
  module: ModuleSummary;
  selected: boolean;
  disabled: boolean;
  reason?: string;
  onActivate: () => void;
}) {
  const onClick = useCallback(() => {
    if (disabled) return;
    onActivate();
  }, [disabled, onActivate]);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      title={disabled ? reason : undefined}
      onClick={onClick}
      className={cn(
        "relative flex flex-col gap-3 rounded-none border border-border bg-card p-4 text-left text-card-foreground shadow-sm transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !disabled && "cursor-pointer hover:bg-accent/40",
        selected && "border-foreground ring-1 ring-foreground",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <ModuleLogo logo={m.logo} label={m.label} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm leading-tight font-semibold">{m.label}</h3>
            {selected && <IconCheck className="size-4 shrink-0 text-foreground" aria-hidden />}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{m.description}</p>
        </div>
      </div>
      {disabled && reason ? (
        <p className="rounded-none bg-muted/60 px-2 py-1 text-[11px] leading-snug text-muted-foreground">
          {reason}
        </p>
      ) : null}
    </button>
  );
}

function describeError(error: ResolveError): string {
  switch (error.kind) {
    case "missing-peer":
      return `Pick a ${slotLabel(error.slot)} module first.`;
    case "incompatible-peer":
      return `Doesn't pair with ${error.peer} (your ${slotLabel(error.slot)} pick).`;
    case "no-adapter":
      return "No adapter matches your current stack.";
  }
}
