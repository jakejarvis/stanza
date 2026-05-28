import { themeToTreeStyles } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { FILE_TREE_ICONS } from "@/components/builder/file-tree-icons";
import { useTheme } from "@/components/theme-provider";
import { Card } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Spinner } from "@/components/ui/spinner";
import { useGracePeriod } from "@/hooks/use-grace-period";
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

// Mirror TanStack Router's `defaultPendingMs` / `defaultPendingMinMs`: wait
// before showing a pending indicator (skip the flash for fast loads), and once
// shown, keep it visible at least this long (avoid flicker on near-misses).
const OVERLAY_PENDING_MS = 300;
const OVERLAY_MIN_MS = 250;

// Prefer the root `package.json` — best at-a-glance summary of the stack.
function defaultPathFor(filePaths: string[]): string | undefined {
  return filePaths.includes("package.json") ? "package.json" : filePaths[0];
}

// `@pierre/trees`' public `item.select()` is additive (it calls
// `selectPath` on the controller, not `selectOnlyPath`). To get
// single-select semantics from the React surface, drop sibling selections
// first.
function selectOnly(
  model: {
    getSelectedPaths(): readonly string[];
    getItem(path: string): { select(): void; deselect(): void } | null;
  },
  path: string,
): void {
  for (const selected of model.getSelectedPaths()) {
    if (selected !== path) model.getItem(selected)?.deselect();
  }
  model.getItem(path)?.select();
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
  // URL hash mirrors the open file ("apps/web/src/index.tsx" etc.) so refreshes
  // and shared links land on the same selection. Slashes are valid in a URL
  // fragment, so paths go in raw — no encoding needed.
  const hash = useLocation({ select: (l) => l.hash });
  const navigate = useNavigate({ from: "/" });
  const defaultPath = useMemo(() => defaultPathFor(filePaths), [filePaths]);

  // The URL hash is the source of truth for "currently open file": folder
  // clicks don't change it (handled in `onSelectionChange` below), so the
  // preview pane keeps the last user-selected file even while a folder is
  // visually selected in the tree.
  const activePath = hash && filePaths.includes(hash) ? hash : defaultPath;
  const preview = activePath ? previews[activePath] : undefined;

  // `useFileTree` is lazy-init and reads its options once, so the selection
  // handler bound at init must read latest navigate/hash/defaultPath via refs.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const hashRef = useRef(hash);
  hashRef.current = hash;
  const defaultPathRef = useRef(defaultPath);
  defaultPathRef.current = defaultPath;
  const modelRef = useRef<ReturnType<typeof useFileTree>["model"] | null>(null);

  // Tree → URL: fired by `@pierre/trees` on every selection change (user clicks
  // OR programmatic `select()` from our reseed/hash-sync effects below). Skip
  // folder selections so latching survives folder expansion, and skip no-op
  // pushes so programmatic selects don't bounce back.
  const onSelectionChange = useCallback((selectedPaths: readonly string[]) => {
    const sel = selectedPaths[0];
    if (!sel) return;
    const item = modelRef.current?.getItem(sel);
    if (!item || item.isDirectory()) return;

    const nextHash = sel !== defaultPathRef.current ? sel : "";
    if (nextHash === hashRef.current) return;
    void navigateRef.current({
      search: (prev) => prev,
      hash: nextHash,
      replace: true,
      resetScroll: false,
      hashScrollIntoView: false,
    });
  }, []);

  // `useFileTree` builds the model once (lazy init) and doesn't react to later
  // `paths` changes — we re-seed manually in the effect below.
  const { model } = useFileTree({
    paths: filePaths,
    search: false,
    unsafeCSS: TRUNCATE_FIX_CSS,
    icons: FILE_TREE_ICONS,
    onSelectionChange,
  });
  modelRef.current = model;

  // Re-seed the model when `filePaths` changes. `resetPaths` collapses
  // everything, so we replay expansion manually; it preserves selection for
  // surviving paths, but we still pin selection to `next` via `selectOnly`
  // so a transiently-empty hash (during a parent navigate) can't bleed the
  // default into the selection alongside the open file.
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
    const preservedExpansion = [...expandedSet].filter((dir) => {
      const segments = dir.split("/");
      segments.pop();
      let prefix = "";
      for (const segment of segments) {
        prefix = prefix ? `${prefix}/${segment}` : segment;
        if (!expandedSet.has(prefix)) return false;
      }
      return true;
    });
    // Prefer the hash (deep link / refresh), else the default. Hash is read
    // via ref so its changes don't reseed.
    const initialHash = hashRef.current;
    const next = initialHash && filePaths.includes(initialHash) ? initialHash : defaultPath;
    // Reveal the selected file by expanding its ancestor chain — otherwise
    // the tree selects a row that's collapsed out of view.
    const expanded = [
      ...new Set([...preservedExpansion, ...(next ? directoryPaths([next]) : [])]),
    ].toSorted();
    model.resetPaths(filePaths, { initialExpandedPaths: expanded });
    if (next) selectOnly(model, next);
    prevPathsRef.current = filePaths;
  }, [model, filePaths, defaultPath]);

  // URL → tree: back/forward (and intra-app links) drop a new hash; reflect
  // it in the tree. The resulting programmatic `select()` fires
  // `onSelectionChange`, which short-circuits on the matching hash.
  useEffect(() => {
    if (!hash || !filePaths.includes(hash)) return;
    if (model.getSelectedPaths()[0] === hash) return;
    // Expand ancestors so the just-selected row is actually visible.
    for (const dir of directoryPaths([hash])) {
      const item = model.getItem(dir);
      if (item && "expand" in item) item.expand();
    }
    selectOnly(model, hash);
  }, [hash, filePaths, model]);

  // Drive the tree's palette from the app theme; otherwise it auto-detects via
  // `prefers-color-scheme` and mismatches when the user overrides the OS theme.
  const { resolvedTheme } = useTheme();
  const treeStyle = useMemo(() => themeToTreeStyles({ type: resolvedTheme }), [resolvedTheme]);

  // Desktop-first default so SSR/first paint match the common case.
  const isWide = useMediaQuery("(min-width: 640px)", true);

  const showOverlay = useGracePeriod(isReloading, OVERLAY_PENDING_MS, OVERLAY_MIN_MS);

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
        {showOverlay ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card/50 backdrop-blur-[1px]"
          >
            <Spinner className="size-5 text-muted-foreground" aria-hidden="true" />
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
      Files appear here as you add modules.
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
        Pick a file to preview.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="truncate overflow-hidden border-b border-border bg-muted/20 px-4 py-2 font-mono text-[11px] text-muted-foreground">
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
