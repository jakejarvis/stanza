import type { CategoryId } from "@stanza/registry";
import { isMulti } from "@stanza/registry";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { startTransition, useCallback, useMemo, useOptimistic, useRef } from "react";

import { FilePreview } from "@/components/builder/file-preview";
import { ModuleCards } from "@/components/builder/module-cards";
import { ProjectSetup } from "@/components/builder/project-setup";
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
  // Same-pathname gate so navigations *away* from this route don't flash the
  // overlay before the page unmounts. `useRouterState` is the documented
  // primitive for router-wide pending state; FilePreview applies its own
  // pendingMs-style grace period before actually showing the overlay.
  const isReloading = useRouterState({
    select: (s) => s.isLoading && s.location.pathname === s.resolvedLocation?.pathname,
  });
  const parsed = useMemo(() => parseSelections(search), [search]);
  const { name, pm } = parsed;
  // Drop orphaned dependents from a shared link (e.g. `?orm=drizzle` with no
  // `db`) so cards + command don't render an unresolvable selection.
  const selections = useMemo(
    () => pruneUnresolved(state.modules, parsed.selections),
    [state.modules, parsed.selections],
  );

  const [optimistic, setOptimistic] = useOptimistic(selections, (_prev, next: Selections) => next);

  // Latest-value snapshot so setName/setPm/toggle keep stable identities and
  // downstream memoization (`ModuleCard(s)`) actually pays off.
  const latest = useRef({ name, pm, optimistic, modules: state.modules });
  latest.current = { name, pm, optimistic, modules: state.modules };

  const setName = useCallback(
    (next: string) => {
      // Build off the optimistic snapshot, not the committed URL — otherwise a
      // debounced name push mid-flight drops an uncommitted toggle.
      void navigate({
        search: toSearchParams({
          name: next,
          pm: latest.current.pm,
          selections: latest.current.optimistic,
        }),
        hash: true,
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  const setPm = useCallback(
    (next: PackageManager) => {
      void navigate({
        search: toSearchParams({
          name: latest.current.name,
          pm: next,
          selections: latest.current.optimistic,
        }),
        hash: true,
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  const toggle = useCallback(
    (category: CategoryId, id: string) => {
      const snapshot = latest.current;
      // Build off the optimistic snapshot so rapid clicks accumulate.
      const current = snapshot.optimistic[category] ?? [];
      const draft: Selections = { ...snapshot.optimistic };
      if (isMulti(category)) {
        const enabled = !current.includes(id);
        const nextIds = enabled ? [...current, id] : current.filter((x) => x !== id);
        if (nextIds.length > 0) draft[category] = nextIds;
        else delete draft[category];
        capture("builder_addon_toggled", { category, addon: id, enabled });
      } else if (current[0] === id) {
        // Clicking the selected single-choice module clears it.
        delete draft[category];
        capture("builder_module_deselected", { category });
      } else {
        draft[category] = [id];
        capture("builder_module_selected", { category, module: id });
      }
      // Dropping a peer can strand its dependents (e.g. `db` → `orm`); prune.
      const next = pruneUnresolved(snapshot.modules, draft);
      startTransition(async () => {
        setOptimistic(next);
        await navigate({
          search: toSearchParams({ name: snapshot.name, pm: snapshot.pm, selections: next }),
          hash: true,
          replace: true,
          resetScroll: false,
        });
      });
    },
    [capture, navigate, setOptimistic],
  );

  const commandBar = <ProjectSetup name={name} defaultName={DEFAULT_NAME} onNameChange={setName} />;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Mobile: command sits above the slot cards (no scrolling past all of
          them to reach it). On lg the right column owns it instead. */}
      <div className="min-w-0 lg:hidden">{commandBar}</div>
      <section className="min-w-0 space-y-8">
        <ModuleCards
          modules={state.modules}
          summaries={state.index.modules}
          selections={optimistic}
          onToggle={toggle}
        />
      </section>
      <section className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:self-start">
        <div className="hidden lg:block">{commandBar}</div>
        <FilePreview
          filePaths={state.filePaths}
          previews={state.previews}
          isReloading={isReloading}
          header={<CommandPreview name={name} selections={selections} pm={pm} onPmChange={setPm} />}
        />
      </section>
    </div>
  );
}
