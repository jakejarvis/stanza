"use client";

import type { ModuleSummary, RegistryIndex } from "@stanza/registry";
import { categoryLabel } from "@stanza/registry";
import { IconBookmark, IconSearch } from "@tabler/icons-react";
import { formatForDisplay, useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import type { SortedResult } from "fumadocs-core/search";
import { useDocsSearch } from "fumadocs-core/search/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModuleLogo } from "@/components/module-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { usePointerCapability } from "@/hooks/use-pointer-capability";
import { groupByCategory } from "@/lib/module-search";
import type { DocsIndex } from "@/server/docs-index.functions";

const HOTKEY = "Mod+K";
const DEBOUNCE_MS = 150;

/**
 * One row's worth of docs result. Unified for empty-state pages (which carry
 * a plain `description`) and searched hits (which carry `excerptHtml`, the
 * markdown excerpt with `<mark>` highlight tags from Fumadocs).
 */
type DocItem = {
  url: string;
  title: string;
  excerptHtml?: string;
  description?: string;
};

type Hit = { kind: "doc"; item: DocItem } | { kind: "module"; module: ModuleSummary };

type Group = { key: string; label: string; hits: Hit[] };

/**
 * Global search popover. Triggered by a search-input-looking button in the
 * header and by `Mod+K`.
 *
 * Empty query renders a Docs page list and all modules grouped by category
 * from the lightweight data the root loader already ships. Typed queries
 * fan out to `/api/search/docs` (Fumadocs Orama) and `/api/search/modules`
 * (server-side Orama over richer fields than the client ever sees), so the
 * registry can grow without bloating any client payload.
 */
export function SiteSearch({ registry, docs }: { registry: RegistryIndex; docs: DocsIndex }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);
  const { isTouchDevice } = usePointerCapability();

  useHotkey(HOTKEY, () => setOpen((o) => !o));
  const [hotkeyLabel, setHotkeyLabel] = useState(() =>
    formatForDisplay(HOTKEY, { platform: "mac" }),
  );
  useEffect(() => setHotkeyLabel(formatForDisplay(HOTKEY)), []);

  // Docs: Fumadocs' hook handles debounce + abort + caching internally.
  const docsSearch = useDocsSearch({
    type: "fetch",
    api: "/api/search/docs",
    delayMs: DEBOUNCE_MS,
  });
  useEffect(() => {
    docsSearch.setSearch(query);
  }, [query, docsSearch]);

  // Modules: small hand-rolled debounced fetch (not worth abstracting).
  const [moduleResults, setModuleResults] = useState<ModuleSummary[] | null>(null);
  useEffect(() => {
    if (!query.trim()) {
      setModuleResults(null);
      return () => {};
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search/modules?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: unknown) => setModuleResults(parseModuleResults(data)))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          // Surface network/parse failures as "no matches" rather than blanking
          // the dialog or throwing past React's render loop.
          setModuleResults([]);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pageTitlesByUrl = useMemo(
    () => new Map(docs.pages.map((p) => [p.url, p.title])),
    [docs.pages],
  );

  const groups: Group[] = useMemo(() => {
    const isSearching = query.trim().length > 0;
    const out: Group[] = [];

    if (isSearching) {
      const data = docsSearch.query.data;
      const docHits = Array.isArray(data) ? data : [];
      const items = dedupeDocsByPage(docHits, pageTitlesByUrl);
      if (items.length > 0) {
        out.push({
          key: "docs",
          label: "Docs",
          hits: items.map((item) => ({ kind: "doc", item })),
        });
      }
    } else if (docs.pages.length > 0) {
      out.push({
        key: "docs",
        label: "Docs",
        hits: docs.pages.map((page) => ({
          kind: "doc",
          item: { url: page.url, title: page.title, description: page.description },
        })),
      });
    }

    const moduleList = isSearching ? (moduleResults ?? []) : registry.modules;
    for (const { group, modules } of groupByCategory(moduleList)) {
      out.push({
        key: `cat:${group}`,
        label: categoryLabel(group),
        hits: modules.map((module) => ({ kind: "module", module })),
      });
    }

    return out;
  }, [query, docsSearch.query.data, moduleResults, docs.pages, registry.modules, pageTitlesByUrl]);

  const flat: Hit[] = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  useEffect(() => setActiveIndex(0), [query]);

  const select = useCallback(
    (hit: Hit) => {
      setOpen(false);
      if (hit.kind === "module") {
        void navigate({
          to: "/registry/$category/$id",
          params: { category: hit.module.category, id: hit.module.id },
        });
      } else {
        void navigate({ to: hit.item.url });
      }
    },
    [navigate],
  );

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setActiveIndex(0);
    }
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (flat.length ? (i + 1) % flat.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = flat[activeIndex];
        if (hit) select(hit);
      }
    },
    [flat, activeIndex, select],
  );

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  let flatIndex = 0;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(true)}
        aria-label="Open search dialog"
        className="gap-2 bg-background px-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:min-w-[180px] sm:px-2.5"
      >
        <IconSearch data-icon="inline-start" aria-hidden />
        <span className="hidden flex-1 text-left text-[13px] font-normal sm:inline">Search…</span>
        <Kbd className="ml-2 hidden sm:inline">{hotkeyLabel}</Kbd>
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 overflow-hidden rounded-none p-0" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>
              Search across the registry and documentation. Use arrow keys to navigate.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b px-3">
            <IconSearch className="size-4 shrink-0 opacity-50" aria-hidden />
            <input
              autoFocus={!isTouchDevice}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search docs and modules…"
              aria-label="Search docs and modules"
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div
            ref={listRef}
            className="max-h-72 overflow-x-hidden overflow-y-auto overscroll-contain p-1"
          >
            {flat.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No results.</div>
            ) : (
              groups.map((group) => (
                <div key={group.key} className="overflow-hidden">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">{group.label}</div>
                  {group.hits.map((hit) => {
                    const i = flatIndex++;
                    return (
                      <SearchRow
                        key={hitKey(hit, i)}
                        hit={hit}
                        index={i}
                        active={i === activeIndex}
                        onSelect={select}
                        onActivate={setActiveIndex}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Fumadocs returns one SortedResult per matched page/heading/text. Collapse
 * multiple hits on the same page into a single row that shows the page title
 * + the highest-ranked matched excerpt. Navigation targets the first
 * matched anchor (so deep-links still work).
 */
function dedupeDocsByPage(hits: SortedResult[], pageTitlesByUrl: Map<string, string>): DocItem[] {
  const byPage = new Map<string, DocItem>();
  for (const hit of hits) {
    const parentUrl = hit.url.split("#")[0] ?? hit.url;
    const title = pageTitlesByUrl.get(parentUrl) ?? (hit.type === "page" ? hit.content : parentUrl);
    const existing = byPage.get(parentUrl);
    if (!existing) {
      byPage.set(parentUrl, {
        url: hit.url,
        title,
        excerptHtml: hit.type === "page" ? undefined : stripMarkdownEmphasis(hit.content),
      });
    } else if (!existing.excerptHtml && hit.type !== "page") {
      // We've seen the page (title-only match); now we have a sub-hit excerpt.
      // Promote the URL to the sub-hit anchor so Enter deep-links to it.
      byPage.set(parentUrl, {
        ...existing,
        url: hit.url,
        excerptHtml: stripMarkdownEmphasis(hit.content),
      });
    }
  }
  return [...byPage.values()];
}

function parseModuleResults(data: unknown): ModuleSummary[] {
  if (!data || typeof data !== "object") return [];
  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  // First-party endpoint: we control the response shape in api.search.modules.ts.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return results as ModuleSummary[];
}

function hitKey(hit: Hit, index: number): string {
  if (hit.kind === "module") return `m:${hit.module.category}:${hit.module.id}`;
  // url + index, since the same docs page may appear in different positions across queries.
  return `d:${hit.item.url}:${index}`;
}

function SearchRow({
  hit,
  index,
  active,
  onSelect,
  onActivate,
}: {
  hit: Hit;
  index: number;
  active: boolean;
  onSelect: (hit: Hit) => void;
  onActivate: (index: number) => void;
}) {
  const handleSelect = useCallback(() => onSelect(hit), [onSelect, hit]);
  const handlePointerMove = useCallback(() => onActivate(index), [onActivate, index]);

  return (
    <button
      type="button"
      tabIndex={-1}
      data-index={index}
      data-selected={active || undefined}
      onClick={handleSelect}
      onPointerMove={handlePointerMove}
      className="flex w-full cursor-pointer items-center gap-2 rounded-none px-2 py-2 text-left text-xs outline-hidden data-[selected]:bg-muted data-[selected]:text-foreground"
    >
      <RowContent hit={hit} />
    </button>
  );
}

function RowContent({ hit }: { hit: Hit }) {
  if (hit.kind === "module") {
    return (
      <>
        <ModuleLogo logo={hit.module.logo} label={hit.module.label} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{hit.module.label}</div>
          <div className="truncate text-[11px] text-muted-foreground">{hit.module.description}</div>
        </div>
      </>
    );
  }
  return (
    <>
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
      >
        <IconBookmark className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{hit.item.title}</div>
        {hit.item.excerptHtml ? (
          <div
            className="truncate text-[11px] text-muted-foreground [&_mark]:bg-yellow-200/60 [&_mark]:px-0.5 [&_mark]:text-foreground dark:[&_mark]:bg-yellow-500/30"
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: hit.item.excerptHtml }}
          />
        ) : hit.item.description ? (
          <div className="truncate text-[11px] text-muted-foreground">{hit.item.description}</div>
        ) : null}
      </div>
    </>
  );
}

const MARKDOWN_EMPHASIS = /(\*\*|__|`)/g;
const MARKDOWN_ITALIC = /(?<![*_\w])[*_](?!\s)([^*_\n]+?)(?<!\s)[*_](?![*_\w])/g;

function stripMarkdownEmphasis(content: string): string {
  return content.replace(MARKDOWN_EMPHASIS, "").replace(MARKDOWN_ITALIC, "$1");
}
