import { ImageResponse } from "@takumi-rs/image-response";
import { createFileRoute } from "@tanstack/react-router";
import type { RegistryIndex } from "@withstanza/schema";

import { OgCard } from "@/server/og-card.server";
import { loadRegistryFile } from "@/server/registry-base.server";

/**
 * `/og/registry/$category/$id.webp` — per-module OG card (e.g. `/og/registry/auth/clerk.webp`),
 * mirroring the public `/registry/$category/$id` URL. Dynamically rendered at request time via
 * Takumi. Bails 404 when the module is unknown.
 */
export const Route = createFileRoute("/og/registry/$category/{$id}.webp")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const category = params.category;
        const id = params.id;
        if (!category || !id) {
          return new Response("Not found", { status: 404 });
        }

        let index: RegistryIndex;
        try {
          index = await loadRegistryFile<RegistryIndex>("index.json");
        } catch {
          return new Response("Registry unavailable", { status: 502 });
        }

        const meta = index.modules.find((m) => m.category === category && m.id === id);
        if (!meta) {
          return new Response("Not found", { status: 404 });
        }

        return new ImageResponse(OgCard({ meta }), {
          width: 1200,
          height: 630,
          format: "webp",
          headers: {
            "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
