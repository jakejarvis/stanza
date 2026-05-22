import type { CategoryId, Module, ModuleSummary, ResolveError } from "@stanza/registry";
import {
  categoryLabel,
  emptyManifest,
  isMulti,
  KNOWN_CATEGORIES,
  PEER_CATEGORIES,
  resolveAdapter,
} from "@stanza/registry";
import { IconCheck } from "@tabler/icons-react";
import { useCallback } from "react";

import { ModuleLogo } from "@/components/module-logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Selections } from "@/lib/selection";
import { cn } from "@/lib/utils";

export function SlotCards({
  modules,
  summaries,
  selections,
  onToggle,
}: {
  modules: Record<string, Module>;
  summaries: ModuleSummary[];
  selections: Selections;
  onToggle: (category: CategoryId, id: string) => void;
}) {
  // Shared peer context: the chosen one-cardinality modules. Every card resolves
  // compatibility against this.
  const pending: Partial<Record<CategoryId, Module>> = {};
  for (const c of PEER_CATEGORIES) {
    const id = selections[c]?.[0];
    if (id && modules[`${c}:${id}`]) pending[c] = modules[`${c}:${id}`];
  }

  // Only render categories that actually have modules in the registry.
  const categories = KNOWN_CATEGORIES.filter((c) => summaries.some((m) => m.category === c));

  return (
    <div className="space-y-8">
      {categories.map((category, index) => (
        <ModuleSection
          key={category}
          group={category}
          summaries={summaries}
          modulesById={modules}
          pending={pending}
          index={index + 1}
          multi={isMulti(category)}
          isSelected={(m) => Boolean(selections[category]?.includes(m.id))}
          onActivate={(m) => onToggle(category, m.id)}
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
  multi: _multi, // TODO: add back in via a info tooltip
  isSelected,
  onActivate,
}: {
  group: CategoryId;
  summaries: ModuleSummary[];
  modulesById: Record<string, Module>;
  pending: Partial<Record<CategoryId, Module>>;
  index: number;
  multi: boolean;
  isSelected: (m: ModuleSummary) => boolean;
  onActivate: (m: ModuleSummary, selected: boolean) => void;
}) {
  const modules = summaries.filter((m) => m.category === group);
  if (modules.length === 0) return null;

  const manifest = emptyManifest({ name: "t" });
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {String(index).padStart(2, "0")}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{categoryLabel(group)}</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modules.map((m) => {
          const full = modulesById[`${m.category}:${m.id}`];
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

  const card = (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative flex h-full w-full flex-col gap-3 rounded-none border border-border bg-card p-4 text-left text-card-foreground shadow-sm transition-colors",
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
    </button>
  );

  if (!disabled || !reason) return card;

  return (
    <Tooltip>
      <TooltipTrigger nativeButton={false} render={<span className="block h-full" />}>
        {card}
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function describeError(error: ResolveError): string {
  switch (error.kind) {
    case "missing-peer":
      return `Pick a ${categoryLabel(error.category)} module first.`;
    case "incompatible-peer":
      return `Doesn't pair with ${error.peer} (your ${categoryLabel(error.category)} pick).`;
    case "no-adapter":
      return "No adapter matches your current stack.";
  }
}
