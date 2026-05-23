import { themeToTreeStyles } from "@pierre/trees";
import { FileTree, useFileTree, useFileTreeSelection } from "@pierre/trees/react";
import { IconLoader2 } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";

import { useTheme } from "@/components/theme-provider";
import { Card } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Preview } from "@/server/highlighter";

// Flatten @pierre/trees' middle-truncate to a single-line ellipsis — its
// default mashes both halves together with no visible ellipsis when narrow.
const TRUNCATE_FIX_CSS = `
[data-item-section="content"] [data-truncate-group-container="middle"] {
  display: block !important;
  min-width: 0 !important;
  overflow: hidden !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
}
[data-item-section="content"] [data-truncate-group-container="middle"] * {
  display: inline !important;
  position: static !important;
  height: auto !important;
  margin: 0 !important;
  white-space: nowrap !important;
}
[data-item-section="content"] [data-truncate-group-container="middle"] [data-truncate-content="overflow"],
[data-item-section="content"] [data-truncate-group-container="middle"] [data-truncate-marker-cell] {
  display: none !important;
}`;

// Prefer the root `package.json` — best at-a-glance summary of the stack.
function defaultPathFor(filePaths: string[]): string | undefined {
  return filePaths.includes("package.json") ? "package.json" : filePaths[0];
}

// "a/b/c.ts" → ["a", "a/b"].
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
  isReloading,
  header,
}: {
  filePaths: string[];
  previews: Record<string, Preview>;
  /** True while the route's loader is rerunning — drives the overlay. */
  isReloading: boolean;
  /** Rendered into the pane's header bar (the install command row). */
  header: ReactNode;
}) {
  // `useFileTree` builds the model once (lazy init) and doesn't react to later
  // `paths` changes — we re-seed manually in the effect below.
  const { model } = useFileTree({
    paths: filePaths,
    search: false,
    unsafeCSS: TRUNCATE_FIX_CSS,
  });

  // Re-seed the model when `filePaths` changes. `resetPaths` collapses
  // everything and clears selection, so we replay both manually.
  const prevPathsRef = useRef(filePaths);
  useEffect(() => {
    const expandedSet = new Set(
      directoryPaths(prevPathsRef.current).filter((dir) => {
        const item = model.getItem(dir);
        return item != null && "isExpanded" in item && item.isExpanded();
      }),
    );
    // Collapsing a directory leaves its descendants flagged expanded.
    // `initialExpandedPaths` re-expands the full ancestor chain of every path
    // given, so replaying such a descendant would re-open the just-collapsed
    // parent. Keep only dirs whose entire ancestor chain is still expanded.
    const expanded = [...expandedSet].filter((dir) => {
      const segments = dir.split("/");
      segments.pop();
      let prefix = "";
      for (const segment of segments) {
        prefix = prefix ? `${prefix}/${segment}` : segment;
        if (!expandedSet.has(prefix)) return false;
      }
      return true;
    });
    expanded.sort();
    const previousSelection = model.getSelectedPaths()[0];
    model.resetPaths(filePaths, { initialExpandedPaths: expanded });
    // Keep the open file if it survived, else fall back to the default.
    const next =
      previousSelection != null && filePaths.includes(previousSelection)
        ? previousSelection
        : defaultPathFor(filePaths);
    if (next) model.getItem(next)?.select();
    prevPathsRef.current = filePaths;
  }, [model, filePaths]);

  const selectedPaths = useFileTreeSelection(model);
  const activePath = selectedPaths[0] ?? defaultPathFor(filePaths);
  const preview = activePath ? previews[activePath] : undefined;

  // Drive the tree's palette from the app theme; otherwise it auto-detects via
  // `prefers-color-scheme` and mismatches when the user overrides the OS theme.
  const { resolvedTheme } = useTheme();
  const treeStyle = useMemo(() => themeToTreeStyles({ type: resolvedTheme }), [resolvedTheme]);

  // Desktop-first default so SSR/first paint match the common case.
  const isWide = useMediaQuery("(min-width: 640px)", true);

  return (
    <Card className="gap-0 overflow-hidden p-0 lg:min-h-0 lg:flex-1">
      <div className="border-b border-border bg-muted/30 px-3 py-2">{header}</div>

      <div className="relative flex min-h-[280px] flex-col lg:min-h-0 lg:flex-1">
        {filePaths.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="h-[420px] lg:h-auto lg:min-h-0 lg:flex-1">
            <ResizablePanelGroup orientation={isWide ? "horizontal" : "vertical"}>
              <ResizablePanel defaultSize="35%" minSize="20%">
                <FileTree
                  key={resolvedTheme}
                  model={model}
                  className="h-full overflow-auto py-2 [--trees-accent-override:var(--ring)] [--trees-bg-override:transparent] [--trees-border-radius-override:0px] [--trees-padding-inline-override:8px] [--trees-selected-bg-override:var(--accent)] [--trees-selected-fg-override:var(--accent-foreground)]"
                  style={treeStyle}
                />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize="65%" minSize="35%">
                <PreviewPane preview={preview} path={activePath} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        )}
        {/* Outside the empty/non-empty branch so it also covers the first
            selection (empty → content), where `filePaths` is still empty. */}
        {isReloading ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card/50 backdrop-blur-[1px] transition-opacity duration-150"
          >
            <IconLoader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            <span className="sr-only">Loading…</span>
          </div>
        ) : null}
      </div>
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
      <div className="flex h-full items-center justify-center px-6 py-10 text-sm text-muted-foreground">
        Select a file
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-muted/20 px-4 py-2 font-mono text-[11px] text-muted-foreground">
        {path}
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto text-xs leading-relaxed [&_.line]:pr-0! [&_.line]:pl-0! [&_pre]:bg-transparent! [&_pre]:p-4!"
        // Shiki HTML is server-rendered from our trusted registry payload.
        dangerouslySetInnerHTML={inner}
      />
    </div>
  );
}
