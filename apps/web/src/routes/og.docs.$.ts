import { ImageResponse } from "@takumi-rs/image-response";
import { createFileRoute } from "@tanstack/react-router";

import { source } from "@/lib/source";
import { OgDocs } from "@/server/og-card.server";

/**
 * `/og/docs/$splat` — per-docs-page OG card, mirroring the public
 * `/docs/$splat` URL. The splat resolves to fumadocs page slugs the same way
 * `routes/docs.$.tsx` does. Bails 404 when the page is unknown.
 */
export const Route = createFileRoute("/og/docs/$")({
  server: {
    handlers: {
      GET: ({ params }) => {
        const slugs = params["_splat"]?.split("/").filter(Boolean) ?? [];
        const page = source.getPage(slugs);
        if (!page) {
          return new Response("Not found", { status: 404 });
        }

        return new ImageResponse(
          OgDocs({
            title: page.data.title,
            description: page.data.description ?? "",
            slug: slugs.join("/"),
          }),
          {
            width: 1200,
            height: 630,
            format: "webp",
            headers: {
              "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
            },
          },
        );
      },
    },
  },
});
