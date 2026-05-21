import type { AddonCategoryId, SlotId } from "@stanza/registry";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { FilePreview } from "@/components/builder/file-preview";
import { ProjectSetup } from "@/components/builder/project-setup";
import { SlotCards } from "@/components/builder/slot-cards";
import {
  type AddonSelections,
  type BuilderSearch,
  type Selections,
  DEFAULT_NAME,
  parseSelections,
  resolveSelectedAdapters,
  resolveSelectedAddons,
  toSearchParams,
} from "@/lib/selection";
import type { BuilderState } from "@/server/builder-state.functions";

export function Builder({ state, search }: { state: BuilderState; search: BuilderSearch }) {
  const navigate = useNavigate({ from: "/" });
  const { name, selections, addons } = parseSelections(search);
  const resolved = resolveSelectedAdapters(state.modules, selections);
  const resolvedAddons = resolveSelectedAddons(state.modules, selections, addons);
  const moduleCount =
    Object.keys(resolved).length +
    Object.values(resolvedAddons).reduce((n, entries) => n + entries.length, 0);

  const setName = useCallback(
    (next: string) => {
      void navigate({
        search: toSearchParams({ name: next, selections, addons }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, selections, addons],
  );

  const setSelection = useCallback(
    (slot: SlotId, id: string | undefined) => {
      const next: Selections = { ...selections };
      if (id) next[slot] = id;
      else delete next[slot];
      void navigate({
        search: toSearchParams({ name, selections: next, addons }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, name, selections, addons],
  );

  const toggleAddon = useCallback(
    (category: AddonCategoryId, id: string) => {
      const current = addons[category] ?? [];
      const nextIds = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      const next: AddonSelections = { ...addons };
      if (nextIds.length > 0) next[category] = nextIds;
      else delete next[category];
      void navigate({
        search: toSearchParams({ name, selections, addons: next }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, name, selections, addons],
  );

  const commandBar = (
    <ProjectSetup
      name={name}
      defaultName={DEFAULT_NAME}
      selections={selections}
      addons={addons}
      onNameChange={setName}
    />
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Mobile: the command (the thing to copy) sits above the slot cards so a
          phone user isn't forced to scroll past all five slots to reach it. On
          lg the right column owns it instead. */}
      <div className="min-w-0 lg:hidden">{commandBar}</div>
      <section className="min-w-0 space-y-8">
        <SlotCards
          modules={state.modules}
          summaries={state.index.modules}
          selections={selections}
          addonSelections={addons}
          onSelect={setSelection}
          onToggleAddon={toggleAddon}
        />
      </section>
      <section className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-6rem)] lg:flex-col lg:gap-6 lg:space-y-0 lg:self-start">
        <div className="hidden lg:block">{commandBar}</div>
        <FilePreview
          filePaths={state.filePaths}
          previews={state.previews}
          moduleCount={moduleCount}
        />
      </section>
    </div>
  );
}
