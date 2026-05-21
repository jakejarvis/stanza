import type { Module, ModuleSummary, ResolveError, SlotId } from "@stanza/registry";
import { KNOWN_SLOTS, emptyManifest, resolveAdapter, slotLabel } from "@stanza/registry";
import { IconCheck } from "@tabler/icons-react";

import { ModuleLogo } from "@/components/module-logo";
import type { Selections } from "@/lib/selection";
import { cn } from "@/lib/utils";

const SLOT_LABELS: Record<SlotId, string> = {
  framework: "Framework",
  styling: "Styling",
  db: "Database",
  orm: "ORM",
  auth: "Auth",
};

export function SlotCards({
  modules,
  summaries,
  selections,
  onSelect,
}: {
  modules: Record<string, Module>;
  summaries: ModuleSummary[];
  selections: Selections;
  onSelect: (slot: SlotId, id: string | undefined) => void;
}) {
  return (
    <div className="space-y-8">
      {KNOWN_SLOTS.map((slot, index) => {
        const slotModules = summaries.filter((m) => m.slot === slot);
        if (slotModules.length === 0) return null;
        return (
          <SlotSection
            key={slot}
            slot={slot}
            label={SLOT_LABELS[slot]}
            modules={slotModules}
            modulesById={modules}
            selections={selections}
            index={index + 1}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

function SlotSection({
  slot,
  label,
  modules,
  modulesById,
  selections,
  index,
  onSelect,
}: {
  slot: SlotId;
  label: string;
  modules: ModuleSummary[];
  modulesById: Record<string, Module>;
  selections: Selections;
  index: number;
  onSelect: (slot: SlotId, id: string | undefined) => void;
}) {
  const pending: Partial<Record<SlotId, Module>> = {};
  for (const s of KNOWN_SLOTS) {
    const id = selections[s];
    if (id && modulesById[`${s}:${id}`]) pending[s] = modulesById[`${s}:${id}`];
  }
  const manifest = emptyManifest({ name: "t" });
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {String(index).padStart(2, "0")}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{label}</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modules.map((m) => {
          const full = modulesById[`${m.slot}:${m.id}`];
          const result = full ? resolveAdapter(full, { manifest, pending }) : undefined;
          const disabled = !result?.ok;
          const selected = selections[slot] === m.id;
          const reason = result && !result.ok ? describeError(result.error) : undefined;
          return (
            <ModuleCard
              key={m.id}
              module={m}
              selected={selected}
              disabled={disabled}
              reason={reason}
              onClick={() => {
                if (disabled) return;
                onSelect(slot, selected ? undefined : m.id);
              }}
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
  onClick,
}: {
  module: ModuleSummary;
  selected: boolean;
  disabled: boolean;
  reason?: string;
  onClick: () => void;
}) {
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
      ) : (
        <p className="font-mono text-[10px] text-muted-foreground/70">
          {m.slot}/{m.id} <span className="text-muted-foreground/50">·</span> v{m.version}
        </p>
      )}
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
