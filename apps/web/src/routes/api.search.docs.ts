import { createFileRoute } from "@tanstack/react-router";
import { createFromSource } from "fumadocs-core/search/server";
import { cache } from "react";

import { source } from "@/lib/source";

// React `cache()` memoizes the SearchAPI per server request so any
// concurrent callers in the same render tree share one instance. The
// underlying Orama index is built lazily inside Fumadocs on first `GET`.
const getSearchServer = cache(() => createFromSource(source));

/**
 * `GET /api/search/docs?query=…` — Fumadocs' dynamic search endpoint. The
 * Orama index lives on the server; only ranked hits travel back to the
 * client. Wired to the existing `source` (same one the docs route uses), so
 * adding a docs page picks up automatically without rebuild glue.
 */
export const Route = createFileRoute("/api/search/docs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await getSearchServer().GET(request);
        } catch (error) {
          console.error("[server-error]", error, { source: "/api/search/docs" });
          return Response.json(
            { error: "Search failed", code: "DOCS_SEARCH_FAILED" },
            { status: 500 },
          );
        }
      },
    },
  },
});
