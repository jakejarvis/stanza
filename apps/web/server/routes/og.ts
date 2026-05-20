import { ImageResponse } from "@vercel/og";
import { defineHandler } from "nitro/h3";

import { OgDefault } from "@/server/og-card";

/**
 * `/og` — default OG used by `/`, `/search`, and anywhere without a more
 * specific image. Static-ish content; the SWR header lets the CDN serve it
 * stale for a long time.
 */
export default defineHandler(() => {
  return new ImageResponse(OgDefault(), {
    width: 1200,
    height: 630,
    headers: {
      "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
    },
  });
});
