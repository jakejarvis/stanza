import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";

import { OgDefault } from "@/server/og-card.server";

/**
 * `/og` — default OG used by `/`, `/search`, and anywhere without a more
 * specific image. Static-ish content; the SWR header lets the CDN serve it
 * stale for a long time. A TanStack Start server route (no page component):
 * the `GET` handler streams a PNG straight back.
 */
export const Route = createFileRoute("/og/")({
  server: {
    handlers: {
      GET: () =>
        new ImageResponse(OgDefault(), {
          width: 1200,
          height: 630,
          headers: {
            "cache-control":
              "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
          },
        }),
    },
  },
});
