import { createFileRoute, notFound } from "@tanstack/react-router";

import { getLLMText, source } from "@/lib/source";

// `/docs.md` — markdown variant of the docs index. The `/docs/{$}.md` splat
// route can't match this URL because it requires at least one path segment
// between `/docs/` and `.md`.
export const Route = createFileRoute("/docs.md")({
  server: {
    handlers: {
      GET: async () => {
        const page = source.getPage([]);
        if (!page) throw notFound();
        return new Response(await getLLMText(page), {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
          },
        });
      },
    },
  },
});
