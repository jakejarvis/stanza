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
import { memo, useCallback, useMemo } from "react";

import { ModuleLogo } from "@/components/module-logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Selections } from "@/lib/selection";
import { cn } from "@/lib/utils";

// `resolveAdapter` only inspects `manifest` for shape — the project name is
// irrelevant here. Hoist so each card resolution stops allocating a new one.
const RESOLVER_MANIFEST = emptyManifest({ name: "t" });

export function ModuleCards({
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
  const pending = useMemo<Partial<Record<CategoryId, Module>>>(() => {
    const out: Partial<Record<CategoryId, Module>> = {};
    for (const c of PEER_CATEGORIES) {
      const id = selections[c]?.[0];
      if (id && modules[`${c}:${id}`]) out[c] = modules[`${c}:${id}`];
    }
    return out;
  }, [modules, selections]);

  // Bucket summaries by category once instead of filtering per-section.
  const byCategory = useMemo(() => {
    const map = new Map<CategoryId, ModuleSummary[]>();
    for (const m of summaries) {
      const list = map.get(m.category);
      if (list) list.push(m);
      else map.set(m.category, [m]);
    }
    return map;
  }, [summaries]);

  // Only render categories that actually have modules in the registry.
  const categories = useMemo(() => KNOWN_CATEGORIES.filter((c) => byCategory.has(c)), [byCategory]);

  return (
    <div className="space-y-8">
      {categories.map((category, index) => (
        <ModuleSection
          key={category}
          group={category}
          summaries={byCategory.get(category) ?? []}
          modulesById={modules}
          pending={pending}
          selections={selections}
          index={index + 1}
          multi={isMulti(category)}
          onToggle={onToggle}
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
  selections,
  index,
  multi: _multi, // TODO: add back in via a info tooltip
  onToggle,
}: {
  group: CategoryId;
  summaries: ModuleSummary[];
  modulesById: Record<string, Module>;
  pending: Partial<Record<CategoryId, Module>>;
  selections: Selections;
  index: number;
  multi: boolean;
  onToggle: (category: CategoryId, id: string) => void;
}) {
  if (summaries.length === 0) return null;

  const selectedIds = selections[group];
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {String(index).padStart(2, "0")}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{categoryLabel(group)}</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {summaries.map((m) => {
          const full = modulesById[`${m.category}:${m.id}`];
          const result = full
            ? resolveAdapter(full, { manifest: RESOLVER_MANIFEST, pending })
            : undefined;
          const disabled = !result?.ok;
          const selected = Boolean(selectedIds?.includes(m.id));
          const reason = result && !result.ok ? describeError(result.error) : undefined;
          return (
            <ModuleCard
              key={m.id}
              module={m}
              category={group}
              selected={selected}
              disabled={disabled}
              reason={reason}
              onToggle={onToggle}
            />
          );
        })}
      </div>
    </div>
  );
}

const ModuleCard = memo(function ModuleCard({
  module: m,
  category,
  selected,
  disabled,
  reason,
  onToggle,
}: {
  module: ModuleSummary;
  category: CategoryId;
  selected: boolean;
  disabled: boolean;
  reason?: string;
  onToggle: (category: CategoryId, id: string) => void;
}) {
  const onClick = useCallback(() => {
    if (disabled) return;
    onToggle(category, m.id);
  }, [disabled, onToggle, category, m.id]);

  const card = (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative flex h-full w-full flex-col gap-3 rounded-none border border-border bg-card px-2.5 py-4 text-left text-card-foreground shadow-sm transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !disabled && "cursor-pointer hover:bg-accent/40",
        selected && "border-foreground ring-1 ring-foreground",
        disabled && "pointer-events-none opacity-60",
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
      <TooltipTrigger
        nativeButton={false}
        render={<span className="block h-full cursor-not-allowed" />}
      >
        {card}
      </TooltipTrigger>
      <TooltipContent sideOffset={8}>{reason}</TooltipContent>
    </Tooltip>
  );
});

function describeError(error: ResolveError): string {
  switch (error.kind) {
    case "missing-peer":
      return `Pick a ${categoryLabel(error.category)} module first.`;
    case "incompatible-peer":
      return `Doesn't pair with ${error.peer} (your ${categoryLabel(error.category)} pick).`;
    case "no-adapter":
      return "No adapter matches your current stack.";
    default:
      error satisfies never;
      throw new Error(`Unknown resolve error: ${String(error)}`);
  }
}
