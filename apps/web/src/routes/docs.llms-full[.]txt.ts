import { createFileRoute } from "@tanstack/react-router";

import { getLLMText, source } from "@/lib/source";

/**
 * `/llms-full.txt` — the full processed Markdown of every docs page,
 * concatenated, for LLMs that ingest the entire corpus in one request.
 */
export const Route = createFileRoute("/docs/llms-full.txt")({
  server: {
    handlers: {
      GET: async () => {
        const scanned = await Promise.all(source.getPages().map(getLLMText));
        return new Response(scanned.join("\n\n"), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600, s-maxage=86400",
          },
        });
      },
    },
  },
});
