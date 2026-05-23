import { createFileRoute, notFound } from "@tanstack/react-router";

import { getLLMText, markdownPathToSlugs, source } from "@/lib/source";

export const Route = createFileRoute("/docs/{$}.md")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const segs = params["_splat"]?.split("/").filter(Boolean) ?? [];
        const page = source.getPage(markdownPathToSlugs(segs));
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
