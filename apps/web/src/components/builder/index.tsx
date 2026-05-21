import type { SlotId } from "@stanza/registry";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { FilePreview } from "@/components/builder/file-preview";
import { ProjectSetup } from "@/components/builder/project-setup";
import { SlotCards } from "@/components/builder/slot-cards";
import {
  type BuilderSearch,
  type Selections,
  buildCommand,
  DEFAULT_NAME,
  parseSelections,
  resolveSelectedAdapters,
  toSearchParams,
} from "@/lib/selection";
import type { BuilderState } from "@/server/builder-state.functions";

export function Builder({ state, search }: { state: BuilderState; search: BuilderSearch }) {
  const navigate = useNavigate({ from: "/" });
  const { name, selections } = parseSelections(search);
  const resolved = resolveSelectedAdapters(state.modules, selections);
  const command = buildCommand({ name, selections });

  const setName = useCallback(
    (next: string) => {
      void navigate({
        search: toSearchParams({ name: next, selections }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, selections],
  );

  const setSelection = useCallback(
    (slot: SlotId, id: string | undefined) => {
      const next: Selections = { ...selections };
      if (id) next[slot] = id;
      else delete next[slot];
      void navigate({
        search: toSearchParams({ name, selections: next }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, name, selections],
  );

  const commandBar = (
    <ProjectSetup name={name} defaultName={DEFAULT_NAME} command={command} onNameChange={setName} />
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Mobile: the command (the thing to copy) sits above the slot cards so a
          phone user isn't forced to scroll past all five slots to reach it. On
          lg the right column owns it instead. */}
      <div className="lg:hidden">{commandBar}</div>
      <section className="space-y-8">
        <SlotCards
          modules={state.modules}
          summaries={state.index.modules}
          selections={selections}
          onSelect={setSelection}
        />
      </section>
      <section className="space-y-6 lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-6rem)] lg:flex-col lg:gap-6 lg:space-y-0 lg:self-start">
        <div className="hidden lg:block">{commandBar}</div>
        <FilePreview filePaths={state.filePaths} previews={state.previews} resolved={resolved} />
      </section>
    </div>
  );
}
