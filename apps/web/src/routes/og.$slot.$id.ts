import type { RegistryIndex } from "@stanza/registry";
import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";

import { OgCard } from "@/server/og-card.server";
import { loadRegistryFile } from "@/server/registry-base.server";

/**
 * `/og/$slot/$id` — per-module OG card (e.g. `/og/auth/clerk`). Dynamically
 * rendered at request time via Satori (bundled inside `@vercel/og`). The URL is
 * extensionless on purpose: a `.png` segment is swallowed by Vite/Nitro static
 * asset handling before routing — crawlers read the `image/png` content-type
 * instead. Bails 404 when the module is unknown.
 */
export const Route = createFileRoute("/og/$slot/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slot = params.slot;
        const id = params.id;
        if (!slot || !id) {
          return new Response("Not found", { status: 404 });
        }

        let index: RegistryIndex;
        try {
          index = await loadRegistryFile<RegistryIndex>("index.json");
        } catch {
          return new Response("Registry unavailable", { status: 502 });
        }

        const summary = index.modules.find((m) => m.slot === slot && m.id === id);
        if (!summary) {
          return new Response("Not found", { status: 404 });
        }

        return new ImageResponse(OgCard({ summary }), {
          width: 1200,
          height: 630,
          headers: {
            "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
