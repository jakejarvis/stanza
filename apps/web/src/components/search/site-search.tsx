import type { ModuleSummary, RegistryIndex, SlotId } from "@stanza/registry";
import { slotLabel } from "@stanza/registry";
import { IconSearch } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ModuleLogo } from "@/components/module-logo";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { groupBySlot } from "@/lib/module-search";

/**
 * Global module search. Triggered by a search-input-looking button in the
 * header and by `⌘K` / `Ctrl-K`. cmdk filters the registry index client-side,
 * groups by slot, and navigates to `/m/$slot/$id` on selection.
 */
export function SiteSearch({ index }: { index: RegistryIndex }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(() => groupBySlot(index.modules), [index.modules]);

  const openSearch = useCallback(() => setOpen(true), []);
  const go = useCallback(
    (summary: ModuleSummary) => {
      setOpen(false);
      void navigate({ to: "/m/$slot/$id", params: { slot: summary.slot, id: summary.id } });
    },
    [navigate],
  );

  return (
    <>
      <Button
        variant="outline"
        onClick={openSearch}
        aria-label="Search modules"
        className="gap-2 bg-background px-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:min-w-[180px] sm:px-2.5"
      >
        <IconSearch data-icon="inline-start" />
        <span className="hidden flex-1 text-left sm:inline">Search modules…</span>
        <Kbd className="hidden sm:inline">⌘K</Kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search modules…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {groups.map(({ slot, modules }) => (
            <CommandGroup key={slot} heading={slotLabel(slot as SlotId)}>
              {modules.map((m) => (
                <SearchResult key={`${m.slot}:${m.id}`} summary={m} onGo={go} />
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

function SearchResult({
  summary,
  onGo,
}: {
  summary: ModuleSummary;
  onGo: (summary: ModuleSummary) => void;
}) {
  const onSelect = useCallback(() => onGo(summary), [onGo, summary]);
  return (
    <CommandItem
      value={`${summary.slot} ${summary.id} ${summary.label} ${summary.description}`}
      onSelect={onSelect}
      className="cursor-pointer"
    >
      <ModuleLogo logo={summary.logo} label={summary.label} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{summary.label}</div>
        <div className="truncate text-[11px] text-muted-foreground">{summary.description}</div>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
        {summary.slot}/{summary.id}
      </span>
    </CommandItem>
  );
}
