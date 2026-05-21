import type { ModuleSummary, RegistryIndex, SlotId } from "@stanza/registry";
import { slotLabel } from "@stanza/registry";
import { IconSearch } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ModuleLogo } from "@/components/module-logo";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { groupBySlot } from "@/lib/module-search";
import { cn } from "@/lib/utils";

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

  function go(summary: ModuleSummary) {
    setOpen(false);
    void navigate({ to: "/m/$slot/$id", params: { slot: summary.slot, id: summary.id } });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search modules"
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-none border border-border bg-background px-2 text-xs text-muted-foreground transition-colors sm:px-2.5",
          "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          "sm:min-w-[180px]",
        )}
      >
        <IconSearch className="size-3.5" />
        <span className="hidden flex-1 text-left sm:inline">Search modules…</span>
        <kbd className="hidden font-mono text-[10px] text-muted-foreground/60 sm:inline">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search modules…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {groups.map(({ slot, modules }) => (
            <CommandGroup key={slot} heading={slotLabel(slot as SlotId)}>
              {modules.map((m) => (
                <CommandItem
                  key={`${m.slot}:${m.id}`}
                  value={`${m.slot} ${m.id} ${m.label} ${m.description}`}
                  onSelect={() => go(m)}
                >
                  <ModuleLogo logo={m.logo} label={m.label} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {m.description}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                    {m.slot}/{m.id}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
