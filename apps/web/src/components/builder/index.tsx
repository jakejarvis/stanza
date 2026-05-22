import type { CategoryId } from "@stanza/registry";
import { isMulti } from "@stanza/registry";
import { useNavigate } from "@tanstack/react-router";
import { startTransition, useCallback, useOptimistic } from "react";

import { FilePreview } from "@/components/builder/file-preview";
import { ProjectSetup } from "@/components/builder/project-setup";
import { SlotCards } from "@/components/builder/slot-cards";
import { CommandPreview } from "@/components/command-preview";
import { useAnalytics } from "@/lib/analytics";
import type { PackageManager } from "@/lib/package-manager";
import {
  type BuilderSearch,
  type Selections,
  DEFAULT_NAME,
  parseSelections,
  pruneUnresolved,
  toSearchParams,
} from "@/lib/selection";
import type { BuilderState } from "@/server/builder-state.functions";

export function Builder({ state, search }: { state: BuilderState; search: BuilderSearch }) {
  const navigate = useNavigate({ from: "/" });
  const capture = useAnalytics();
  const parsed = parseSelections(search);
  const { name, pm } = parsed;
  // Sanitize at the URL boundary: a shared link with an orphaned dependent
  // (e.g. `?orm=drizzle` with no `db`) must not render a stuck selected card or
  // leak an invalid flag into the command. The server loader already resolves
  // before building the preview, so this only realigns the cards + command.
  const selections = pruneUnresolved(state.modules, parsed.selections);

  // Card selection is optimistic: a toggle flips the border/check immediately
  // instead of waiting for the loader-backed navigation to commit. The async
  // transition holds the optimistic value until `navigate` resolves, at which
  // point the URL-derived base matches and reconciles seamlessly. The preview
  // pane deliberately stays on committed loader data (it needs server-rendered
  // Shiki HTML) and surfaces its own spinner while that round-trip runs.
  const [optimistic, setOptimistic] = useOptimistic(selections, (_prev, next: Selections) => next);

  const setName = useCallback(
    (next: string) => {
      // Build off the optimistic snapshot, not the committed URL — otherwise a
      // debounced name push landing mid-flight would navigate with stale
      // selections and drop a toggle that hasn't committed yet.
      void navigate({
        search: toSearchParams({ name: next, pm, selections: optimistic }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, pm, optimistic],
  );

  const setPm = useCallback(
    (next: PackageManager) => {
      void navigate({
        search: toSearchParams({ name, pm: next, selections: optimistic }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, name, optimistic],
  );

  const toggle = useCallback(
    (category: CategoryId, id: string) => {
      // Build off the optimistic snapshot so rapid clicks accumulate.
      const current = optimistic[category] ?? [];
      const draft: Selections = { ...optimistic };
      if (isMulti(category)) {
        // Multi-choice: toggle membership in the array.
        const enabled = !current.includes(id);
        const nextIds = enabled ? [...current, id] : current.filter((x) => x !== id);
        if (nextIds.length > 0) draft[category] = nextIds;
        else delete draft[category];
        capture("builder_addon_toggled", { category, addon: id, enabled });
      } else if (current[0] === id) {
        // Single-choice: clicking the selected module clears it.
        delete draft[category];
        capture("builder_module_deselected", { category });
      } else {
        draft[category] = [id];
        capture("builder_module_selected", { category, module: id });
      }
      // Removing or changing a peer can orphan dependents (e.g. dropping `db`
      // strands `orm`); prune them so cards + command never go inconsistent.
      const next = pruneUnresolved(state.modules, draft);
      startTransition(async () => {
        setOptimistic(next);
        await navigate({
          search: toSearchParams({ name, pm, selections: next }),
          replace: true,
          resetScroll: false,
        });
      });
    },
    [capture, navigate, name, pm, optimistic, setOptimistic, state.modules],
  );

  const commandBar = <ProjectSetup name={name} defaultName={DEFAULT_NAME} onNameChange={setName} />;

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
          selections={optimistic}
          onToggle={toggle}
        />
      </section>
      <section className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-6rem)] lg:flex-col lg:gap-6 lg:space-y-0 lg:self-start">
        <div className="hidden lg:block">{commandBar}</div>
        <FilePreview
          filePaths={state.filePaths}
          previews={state.previews}
          header={<CommandPreview name={name} selections={selections} pm={pm} onPmChange={setPm} />}
        />
      </section>
    </div>
  );
}
