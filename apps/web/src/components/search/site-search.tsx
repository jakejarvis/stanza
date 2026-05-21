import type { ModuleSummary, RegistryIndex } from "@stanza/registry";
import { groupLabel, moduleGroup } from "@stanza/registry";
import { IconSearch } from "@tabler/icons-react";
import { formatForDisplay, useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModuleLogo } from "@/components/module-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { groupBySlot } from "@/lib/module-search";
import { cn } from "@/lib/utils";

const HOTKEY = "Mod+K";

function matches(m: ModuleSummary, query: string): boolean {
  if (!query) return true;
  const haystack = `${moduleGroup(m)} ${m.id} ${m.label} ${m.description}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/**
 * Global module search. Triggered by a search-input-looking button in the
 * header and by `⌘K` / `Ctrl-K` (resolved per-platform by `@tanstack/react-hotkeys`).
 * Filters the registry index client-side, groups by slot, and navigates to
 * `/m/$slot/$id` on selection. Arrow keys move the highlight; Enter selects.
 */
export function SiteSearch({ index }: { index: RegistryIndex }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);

  useHotkey(HOTKEY, () => setOpen((o) => !o));

  // Resolved client-side: the platform-aware label differs between server and
  // client, so render nothing until mount to avoid a hydration mismatch.
  const [hotkeyLabel, setHotkeyLabel] = useState<string | null>(null);
  useEffect(() => setHotkeyLabel(formatForDisplay(HOTKEY)), []);

  const filtered = useMemo(
    () => index.modules.filter((m) => matches(m, query)),
    [index.modules, query],
  );
  const groups = useMemo(() => groupBySlot(filtered), [filtered]);
  const flat = useMemo(() => groups.flatMap((g) => g.modules), [groups]);

  useEffect(() => setActiveIndex(0), [query]);

  const selectModule = useCallback(
    (summary: ModuleSummary) => {
      setOpen(false);
      void navigate({ to: "/m/$slot/$id", params: { slot: moduleGroup(summary), id: summary.id } });
    },
    [navigate],
  );

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setActiveIndex(0);
    }
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (flat.length ? (i + 1) % flat.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const m = flat[activeIndex];
        if (m) selectModule(m);
      }
    },
    [flat, activeIndex, selectModule],
  );

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  let flatIndex = 0;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(true)}
        aria-label="Search modules"
        className="gap-2 bg-background px-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:min-w-[180px] sm:px-2.5"
      >
        <IconSearch data-icon="inline-start" />
        <span className="hidden flex-1 text-left sm:inline">Search modules…</span>
        {hotkeyLabel && <Kbd className="hidden sm:inline">{hotkeyLabel}</Kbd>}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="top-1/3 translate-y-0 gap-0 overflow-hidden rounded-none p-0"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Search modules</DialogTitle>
            <DialogDescription>Search the registry for a module to add.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b px-3">
            <IconSearch className="size-4 shrink-0 opacity-50" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search modules…"
              aria-label="Search modules"
              className="h-10 w-full bg-transparent text-xs outline-hidden placeholder:text-muted-foreground"
            />
          </div>
          <div
            ref={listRef}
            className="no-scrollbar max-h-72 overflow-x-hidden overflow-y-auto p-1"
          >
            {flat.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No matches.</div>
            ) : (
              groups.map(({ group, modules }) => (
                <div key={group} className="overflow-hidden">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    {groupLabel(group)}
                  </div>
                  {modules.map((m) => {
                    const i = flatIndex++;
                    return (
                      <SearchResult
                        key={`${moduleGroup(m)}:${m.id}`}
                        summary={m}
                        index={i}
                        active={i === activeIndex}
                        onSelect={selectModule}
                        onActivate={setActiveIndex}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SearchResult({
  summary,
  index,
  active,
  onSelect,
  onActivate,
}: {
  summary: ModuleSummary;
  index: number;
  active: boolean;
  onSelect: (summary: ModuleSummary) => void;
  onActivate: (index: number) => void;
}) {
  const handleSelect = useCallback(() => onSelect(summary), [onSelect, summary]);
  const handlePointerMove = useCallback(() => onActivate(index), [onActivate, index]);
  return (
    <button
      type="button"
      data-index={index}
      data-selected={active || undefined}
      onClick={handleSelect}
      onPointerMove={handlePointerMove}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-none px-2 py-2 text-left text-xs outline-hidden",
        active && "bg-muted text-foreground",
      )}
    >
      <ModuleLogo logo={summary.logo} label={summary.label} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{summary.label}</div>
        <div className="truncate text-[11px] text-muted-foreground">{summary.description}</div>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
        {moduleGroup(summary)}/{summary.id}
      </span>
    </button>
  );
}
