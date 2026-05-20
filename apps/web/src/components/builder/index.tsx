import type { SlotId } from "@stanza/registry";
import { useNavigate } from "@tanstack/react-router";

import { CommandBar } from "@/components/builder/command-bar";
import { FilePreview } from "@/components/builder/file-preview";
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
import type { BuilderState } from "@/server/builder-state";

export function Builder({ state, search }: { state: BuilderState; search: BuilderSearch }) {
  const navigate = useNavigate({ from: "/" });
  const { name, selections } = parseSelections(search);
  const resolved = resolveSelectedAdapters(state.modules, selections);
  const command = buildCommand({ name, selections });

  const setName = (next: string) => {
    void navigate({
      search: toSearchParams({ name: next, selections }),
      replace: true,
    });
  };

  const setSelection = (slot: SlotId, id: string | undefined) => {
    const next: Selections = { ...selections };
    if (id) next[slot] = id;
    else delete next[slot];
    void navigate({
      search: toSearchParams({ name, selections: next }),
      replace: true,
    });
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="space-y-8">
        <SlotCards
          modules={state.modules}
          summaries={state.index.modules}
          selections={selections}
          onSelect={setSelection}
        />
      </section>
      <section className="space-y-6 lg:sticky lg:top-20 lg:self-start">
        <CommandBar
          name={name}
          defaultName={DEFAULT_NAME}
          command={command}
          onNameChange={setName}
        />
        <FilePreview filePaths={state.filePaths} previews={state.previews} resolved={resolved} />
      </section>
    </div>
  );
}
