import type { AddonCategoryId, SlotId } from "@stanza/registry";
import { useNavigate } from "@tanstack/react-router";
import { startTransition, useCallback, useOptimistic } from "react";

import { FilePreview } from "@/components/builder/file-preview";
import { ProjectSetup } from "@/components/builder/project-setup";
import { SlotCards } from "@/components/builder/slot-cards";
import { useAnalytics } from "@/lib/analytics";
import {
  type AddonSelections,
  type BuilderSearch,
  type Selections,
  DEFAULT_NAME,
  parseSelections,
  pruneUnresolved,
  resolveSelectedAdapters,
  resolveSelectedAddons,
  toSearchParams,
} from "@/lib/selection";
import type { BuilderState } from "@/server/builder-state.functions";

export function Builder({ state, search }: { state: BuilderState; search: BuilderSearch }) {
  const navigate = useNavigate({ from: "/" });
  const capture = useAnalytics();
  const parsed = parseSelections(search);
  const { name } = parsed;
  // Sanitize at the URL boundary: a shared link with an orphaned dependent
  // (e.g. `?orm=drizzle` with no `db`) must not render a stuck selected card or
  // leak an invalid flag into the command. The server loader already resolves
  // before building the preview, so this only realigns the cards + command.
  const { selections, addons } = pruneUnresolved(state.modules, parsed.selections, parsed.addons);

  // Card selection is optimistic: a toggle flips the border/check immediately
  // instead of waiting for the loader-backed navigation to commit. The async
  // transition holds the optimistic value until `navigate` resolves, at which
  // point the URL-derived base matches and reconciles seamlessly. The preview
  // pane deliberately stays on committed loader data (it needs server-rendered
  // Shiki HTML) and surfaces its own spinner while that round-trip runs.
  const [optimistic, setOptimistic] = useOptimistic(
    { selections, addons },
    (_prev, next: { selections: Selections; addons: AddonSelections }) => next,
  );

  const resolved = resolveSelectedAdapters(state.modules, selections);
  const resolvedAddons = resolveSelectedAddons(state.modules, selections, addons);
  const moduleCount =
    Object.keys(resolved).length +
    Object.values(resolvedAddons).reduce((n, entries) => n + entries.length, 0);

  const setName = useCallback(
    (next: string) => {
      // Build off the optimistic snapshot, not the committed URL — otherwise a
      // debounced name push landing mid-flight would navigate with stale
      // selections and drop a slot/add-on toggle that hasn't committed yet.
      void navigate({
        search: toSearchParams({ name: next, ...optimistic }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, optimistic],
  );

  const setSelection = useCallback(
    (slot: SlotId, id: string | undefined) => {
      // Build off the optimistic snapshot so rapid clicks accumulate instead of
      // each one resetting against the not-yet-committed URL.
      const draft: Selections = { ...optimistic.selections };
      if (id) draft[slot] = id;
      else delete draft[slot];
      if (id) capture("builder_module_selected", { slot, module: id });
      else capture("builder_module_deselected", { slot });
      // Removing or changing a slot can orphan dependents (e.g. dropping `db`
      // strands `orm`); prune them so cards + command never go inconsistent.
      const next = pruneUnresolved(state.modules, draft, optimistic.addons);
      startTransition(async () => {
        setOptimistic(next);
        await navigate({
          search: toSearchParams({ name, ...next }),
          replace: true,
          resetScroll: false,
        });
      });
    },
    [capture, navigate, name, optimistic, setOptimistic, state.modules],
  );

  const toggleAddon = useCallback(
    (category: AddonCategoryId, id: string) => {
      const current = optimistic.addons[category] ?? [];
      const enabled = !current.includes(id);
      const nextIds = enabled ? [...current, id] : current.filter((x) => x !== id);
      const nextAddons: AddonSelections = { ...optimistic.addons };
      if (nextIds.length > 0) nextAddons[category] = nextIds;
      else delete nextAddons[category];
      capture("builder_addon_toggled", { category, addon: id, enabled });
      const next = { selections: optimistic.selections, addons: nextAddons };
      startTransition(async () => {
        setOptimistic(next);
        await navigate({
          search: toSearchParams({ name, ...next }),
          replace: true,
          resetScroll: false,
        });
      });
    },
    [capture, navigate, name, optimistic, setOptimistic],
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
          selections={optimistic.selections}
          addonSelections={optimistic.addons}
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
