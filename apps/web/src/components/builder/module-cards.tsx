import type { CategoryId, ModuleMetadata, ResolveError } from "@stanza/registry";
import {
  categoryLabel,
  emptyManifest,
  isMulti,
  KNOWN_CATEGORIES,
  PEER_CATEGORIES,
  resolveAdapter,
} from "@stanza/registry";
import { IconCheck, IconInfoCircle } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { memo, useCallback, useMemo } from "react";

import { ModuleLogo } from "@/components/module-logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Selections } from "@/lib/selection";
import { cn } from "@/lib/utils";

// `resolveAdapter` only inspects `manifest` for shape — the project name is
// irrelevant here. Hoist so each card resolution stops allocating a new one.
const RESOLVER_MANIFEST = emptyManifest({ name: "t" });

export function ModuleCards({
  metadata,
  selections,
  onToggle,
}: {
  metadata: ModuleMetadata[];
  selections: Selections;
  onToggle: (category: CategoryId, id: string) => void;
}) {
  // Bucket metadata by category once, and also build a flat `${cat}:${id}`
  // lookup the peer-context memo reuses.
  const { byCategory, byKey } = useMemo(() => {
    const buckets = new Map<CategoryId, ModuleMetadata[]>();
    const keyed = new Map<string, ModuleMetadata>();
    for (const m of metadata) {
      const list = buckets.get(m.category);
      if (list) list.push(m);
      else buckets.set(m.category, [m]);
      keyed.set(`${m.category}:${m.id}`, m);
    }
    return { byCategory: buckets, byKey: keyed };
  }, [metadata]);

  // Shared peer context: the chosen one-cardinality modules. Every card resolves
  // compatibility against this.
  const pending = useMemo<Partial<Record<CategoryId, ModuleMetadata>>>(() => {
    const out: Partial<Record<CategoryId, ModuleMetadata>> = {};
    for (const c of PEER_CATEGORIES) {
      const id = selections[c]?.[0];
      if (!id) continue;
      const mod = byKey.get(`${c}:${id}`);
      if (mod) out[c] = mod;
    }
    return out;
  }, [byKey, selections]);

  // Only render categories that actually have modules in the registry.
  const categories = useMemo(() => KNOWN_CATEGORIES.filter((c) => byCategory.has(c)), [byCategory]);

  return (
    <div className="space-y-8">
      {categories.map((category, index) => (
        <ModuleSection
          key={category}
          group={category}
          metadata={byCategory.get(category) ?? []}
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
  metadata,
  pending,
  selections,
  index,
  multi: _multi, // TODO: add back in via a info tooltip
  onToggle,
}: {
  group: CategoryId;
  metadata: ModuleMetadata[];
  pending: Partial<Record<CategoryId, ModuleMetadata>>;
  selections: Selections;
  index: number;
  multi: boolean;
  onToggle: (category: CategoryId, id: string) => void;
}) {
  if (metadata.length === 0) return null;

  const selectedIds = selections[group];
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {String(index).padStart(2, "0")}
        </span>
        <h2 className="text-lg font-medium tracking-tight">{categoryLabel(group)}</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {metadata.map((m) => {
          const result = resolveAdapter(m, { manifest: RESOLVER_MANIFEST, pending });
          const disabled = !result.ok;
          const selected = Boolean(selectedIds?.includes(m.id));
          const reason = !result.ok ? describeError(result.error) : undefined;
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
  module: ModuleMetadata;
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

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      // Only handle keys aimed at the card itself, not bubbled from the
      // nested website link.
      if (e.target !== e.currentTarget) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onToggle(category, m.id);
      }
    },
    [disabled, onToggle, category, m.id],
  );

  const card = (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
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
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm leading-tight font-medium">{m.label}</h3>
              <Tooltip>
                <TooltipTrigger
                  nativeButton={false}
                  render={
                    <Link
                      to="/registry/$category/$id"
                      params={{ category: m.category, id: m.id }}
                      aria-label={`${m.label} details`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex shrink-0 translate-y-[-1px] items-center justify-center text-foreground/40 transition-colors hover:text-foreground"
                    />
                  }
                >
                  <IconInfoCircle className="size-3.5" aria-hidden />
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>View details</TooltipContent>
              </Tooltip>
            </div>
            {selected && <IconCheck className="size-4 shrink-0 text-foreground" aria-hidden />}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{m.description}</p>
        </div>
      </div>
    </div>
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
      return `Not compatible with ${error.peer} (${categoryLabel(error.category)}).`;
    case "no-adapter":
      return "Not compatible with your current stack.";
    default:
      error satisfies never;
      throw new Error(`Unknown resolve error: ${String(error)}`);
  }
}
