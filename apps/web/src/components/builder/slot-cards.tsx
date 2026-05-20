import type { Logo, Module, ModuleSummary, SlotId } from "@stanza/registry";
import { KNOWN_SLOTS, emptyManifest, resolveAdapter } from "@stanza/registry";
import { IconCheck } from "@tabler/icons-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
          const result = full
            ? resolveAdapter(full, { manifest, pending })
            : { ok: false, error: { kind: "no-adapter" as const } };
          const disabled = !result.ok;
          const selected = selections[slot] === m.id;
          const reason = !result.ok ? describeError(result.error.kind) : undefined;
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
  const card = (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left text-card-foreground shadow-sm transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !disabled && "cursor-pointer hover:bg-accent/40",
        selected && "border-foreground ring-1 ring-foreground",
        disabled && "cursor-not-allowed opacity-50",
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
      <p className="font-mono text-[10px] text-muted-foreground/70">
        {m.slot}/{m.id} <span className="text-muted-foreground/50">·</span> v{m.version}
      </p>
    </button>
  );

  if (!disabled || !reason) return card;
  return (
    <Tooltip>
      <TooltipTrigger render={card} />
      <TooltipContent side="top">{reason}</TooltipContent>
    </Tooltip>
  );
}

function ModuleLogo({ logo, label }: { logo: Logo | undefined; label: string }) {
  if (!logo) {
    // Fallback: a subtle initial-letter tile. Keeps card geometry consistent.
    return (
      <div
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-xs font-semibold text-muted-foreground"
      >
        {label.slice(0, 1)}
      </div>
    );
  }
  const wrapClass =
    "flex size-9 shrink-0 items-center justify-center [&_svg]:size-7 [&_svg]:max-h-7 [&_svg]:max-w-7";
  if (typeof logo === "string") {
    return (
      <div
        aria-hidden
        className={wrapClass}
        // Inlined SVG from our trusted first-party registry payload.
        dangerouslySetInnerHTML={{ __html: logo }}
      />
    );
  }
  return (
    <>
      <div
        aria-hidden
        className={cn(wrapClass, "dark:hidden")}
        dangerouslySetInnerHTML={{ __html: logo.light }}
      />
      <div
        aria-hidden
        className={cn(wrapClass, "hidden dark:flex")}
        dangerouslySetInnerHTML={{ __html: logo.dark }}
      />
    </>
  );
}

function describeError(kind: string): string {
  switch (kind) {
    case "missing-peer":
      return "Needs another slot filled in first.";
    case "incompatible-peer":
      return "Doesn't pair with one of your current picks.";
    case "no-adapter":
      return "No adapter matches your current stack.";
    default:
      return "Not compatible with the current stack.";
  }
}
