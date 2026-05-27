import { createServerFn } from "@tanstack/react-start";

import { getOrderedPages } from "@/lib/source";

export type DocsPageSummary = {
  title: string;
  description?: string;
  url: string;
};

export type DocsIndex = {
  pages: DocsPageSummary[];
};

/**
 * Lightweight list of every docs page (title + url + description). Wired into
 * the root route loader so the global search popover can render the "Docs"
 * group on empty query without fetching anything. Heavy content (structured
 * data, body) is queried separately via `/api/search/docs`.
 */
export const getDocsIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<DocsIndex> => ({
    pages: getOrderedPages().map((p) => ({
      title: p.data.title,
      description: p.data.description,
      url: p.url,
    })),
  }),
);
