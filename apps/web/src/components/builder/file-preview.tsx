import { themeToTreeStyles } from "@pierre/trees";
import { FileTree, useFileTree, useFileTreeSelection } from "@pierre/trees/react";
import { IconLoader2 } from "@tabler/icons-react";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { useTheme } from "@/components/theme-provider";
import { Card } from "@/components/ui/card";
import type { Preview } from "@/server/highlighter";

// Every ancestor directory of each file path, e.g. "a/b/c.ts" → ["a", "a/b"].
function directoryPaths(paths: readonly string[]): string[] {
  const dirs = new Set<string>();
  for (const path of paths) {
    const segments = path.split("/");
    segments.pop();
    let prefix = "";
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      dirs.add(prefix);
    }
  }
  return [...dirs];
}

export function FilePreview({
  filePaths,
  previews,
  moduleCount,
}: {
  filePaths: string[];
  previews: Record<string, Preview>;
  /** Number of selected modules (slots + add-ons) contributing files. */
  moduleCount: number;
}) {
  // @pierre/trees is path-driven. `useFileTree` builds the model once (lazy
  // `useState` init), so it does NOT react to later `paths` changes on its own.
  const { model } = useFileTree({
    paths: filePaths,
    search: false,
  });

  // The parent's loader reruns on every selection change, handing us a fresh
  // `filePaths`. Re-seed the existing model so the tree reflects the new set.
  // `resetPaths` collapses everything by default, so first snapshot which
  // directories the user had expanded (against the *previous* path set, still
  // live in the model) and replay them via `initialExpandedPaths`.
  const prevPathsRef = useRef(filePaths);
  useEffect(() => {
    const expanded = directoryPaths(prevPathsRef.current).filter((dir) => {
      const item = model.getItem(dir);
      return item != null && "isExpanded" in item && item.isExpanded();
    });
    expanded.sort();
    model.resetPaths(filePaths, { initialExpandedPaths: expanded });
    prevPathsRef.current = filePaths;
  }, [model, filePaths]);

  // The model owns selection internally; `useFileTreeSelection` exposes the
  // currently-selected paths as a stable readonly array we subscribe to.
  const selectedPaths = useFileTreeSelection(model);
  // Until the user picks a file, default to the synthesized root package.json
  // (the most useful at-a-glance summary of the stack) when it exists, else the
  // first file in the tree.
  const defaultPath = filePaths.includes("package.json") ? "package.json" : filePaths[0];
  const activePath = selectedPaths[0] ?? defaultPath;
  const preview = activePath ? previews[activePath] : undefined;

  // Drive the tree's shadow-root palette from the app theme — otherwise it
  // auto-detects via `prefers-color-scheme` and mismatches when the user picks
  // a theme different from their OS setting.
  const { resolvedTheme } = useTheme();
  const treeStyle = useMemo(() => themeToTreeStyles({ type: resolvedTheme }), [resolvedTheme]);

  // The route loader reruns its server fn on every selection change; surface
  // that as a subtle overlay so the preview reads as "refreshing" rather than
  // flashing stale content.
  const isLoading = useRouterState({ select: (s) => s.isLoading });

  return (
    <Card className="gap-0 overflow-hidden p-0 lg:min-h-0 lg:flex-1">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">
          {filePaths.length > 0
            ? `${filePaths.length} file${filePaths.length === 1 ? "" : "s"} from ${moduleCount} module${moduleCount === 1 ? "" : "s"}`
            : "Pick a module to preview generated files"}
        </span>
      </div>

      {filePaths.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="relative grid grid-cols-1 sm:min-h-[420px] sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:min-h-0 lg:flex-1">
          <div className="border-b border-border sm:border-r sm:border-b-0">
            <FileTree
              // The shadow-DOM tree captures `style` only at mount, so a
              // post-hydration light→dark flip (theme: "system" resolves to
              // "light" during SSR) would otherwise leave a light tree on a
              // dark page. Re-key on the resolved theme to remount with the
              // right palette; `model` lives in the parent, so selection holds.
              key={resolvedTheme}
              model={model}
              // `--trees-bg-override` is the tree's background var (inherits into
              // its shadow root); transparent lets the card bg show through.
              className="h-[180px] overflow-auto [--trees-bg-override:transparent] sm:h-full sm:max-h-[480px] lg:max-h-none"
              style={treeStyle}
            />
          </div>
          <PreviewPane preview={preview} path={activePath} />
          {isLoading ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card/50 backdrop-blur-[1px] transition-opacity duration-150">
              <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[280px] items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground lg:min-h-0 lg:flex-1">
      The file tree will populate as you pick modules.
    </div>
  );
}

function PreviewPane({
  preview,
  path,
}: {
  preview: Preview | undefined;
  path: string | undefined;
}) {
  const { resolvedTheme } = useTheme();
  const inner = useMemo(
    () => ({ __html: preview ? (resolvedTheme === "dark" ? preview.dark : preview.light) : "" }),
    [preview, resolvedTheme],
  );

  if (!preview || !path) {
    return (
      <div className="flex items-center justify-center px-6 py-10 text-sm text-muted-foreground">
        Select a file
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:min-h-0">
      <div className="border-b border-border bg-muted/20 px-4 py-2 font-mono text-[11px] text-muted-foreground">
        {path}
      </div>
      <div
        className="max-h-[360px] overflow-auto text-xs leading-relaxed sm:max-h-[480px] lg:max-h-none lg:min-h-0 lg:flex-1 [&_pre]:bg-transparent! [&_pre]:p-4!"
        // Shiki HTML is server-rendered from our trusted registry payload.
        dangerouslySetInnerHTML={inner}
      />
    </div>
  );
}
