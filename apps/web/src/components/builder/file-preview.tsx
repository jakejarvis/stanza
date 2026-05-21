import { themeToTreeStyles } from "@pierre/trees";
import { FileTree, useFileTree, useFileTreeSelection } from "@pierre/trees/react";
import type { Module, ModuleAdapter, SlotId } from "@stanza/registry";
import { useEffect, useMemo } from "react";

import { useTheme } from "@/components/theme-provider";
import { Card } from "@/components/ui/card";
import type { Preview } from "@/server/highlighter";

export function FilePreview({
  filePaths,
  previews,
  resolved,
}: {
  filePaths: string[];
  previews: Record<string, Preview>;
  resolved: Partial<Record<SlotId, { module: Module; adapter: ModuleAdapter }>>;
}) {
  // @pierre/trees is path-driven. `useFileTree` builds the model once (lazy
  // `useState` init), so it does NOT react to later `paths` changes on its own.
  const { model } = useFileTree({
    paths: filePaths,
    search: false,
  });

  // The parent's loader reruns on every selection change, handing us a fresh
  // `filePaths`. Re-seed the existing model so the tree reflects the new set.
  useEffect(() => {
    model.resetPaths(filePaths);
  }, [model, filePaths]);

  // The model owns selection internally; `useFileTreeSelection` exposes the
  // currently-selected paths as a stable readonly array we subscribe to.
  const selectedPaths = useFileTreeSelection(model);
  const activePath = selectedPaths[0] ?? filePaths[0];
  const preview = activePath ? previews[activePath] : undefined;

  // Drive the tree's shadow-root palette from the app theme — otherwise it
  // auto-detects via `prefers-color-scheme` and mismatches when the user picks
  // a theme different from their OS setting.
  const { theme } = useTheme();
  const resolvedTheme = useResolvedTheme(theme);
  const treeStyle = useMemo(
    () => themeToTreeStyles({ type: resolvedTheme }),
    [resolvedTheme],
  );

  const slotCount = Object.keys(resolved).length;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">
          {filePaths.length > 0
            ? `${filePaths.length} file${filePaths.length === 1 ? "" : "s"} from ${slotCount} module${slotCount === 1 ? "" : "s"}`
            : "Pick a module to preview generated files"}
        </span>
      </div>

      {filePaths.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid min-h-[420px] grid-cols-1 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <div className="border-b border-border sm:border-r sm:border-b-0">
            <FileTree
              model={model}
              className="h-full max-h-[420px] overflow-auto"
              style={treeStyle}
            />
          </div>
          <PreviewPane preview={preview} path={activePath} />
        </div>
      )}
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[280px] items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
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
  const { theme } = useTheme();
  const resolved = useResolvedTheme(theme);
  const html = useMemo(() => {
    if (!preview) return "";
    return resolved === "dark" ? preview.dark : preview.light;
  }, [preview, resolved]);

  if (!preview || !path) {
    return (
      <div className="flex items-center justify-center px-6 py-10 text-sm text-muted-foreground">
        Select a file
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-border bg-muted/20 px-4 py-2 font-mono text-[11px] text-muted-foreground">
        {path}
      </div>
      <div
        className="overflow-auto text-xs leading-relaxed [&_pre]:bg-transparent! [&_pre]:p-4!"
        // Shiki HTML is server-rendered from our trusted registry payload.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function useResolvedTheme(theme: string): "light" | "dark" {
  // Match the same `light` / `dark` / `system` semantics the ThemeProvider
  // applies to <html>, without re-reading the DOM (this runs server-side too).
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
