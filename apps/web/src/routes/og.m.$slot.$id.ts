import type { RegistryIndex } from "@stanza/registry";
import { ImageResponse } from "@takumi-rs/image-response";
import { createFileRoute } from "@tanstack/react-router";

import { OgCard } from "@/server/og-card.server";
import { loadRegistryFile } from "@/server/registry-base.server";

/**
 * `/og/m/$slot/$id` — per-module OG card (e.g. `/og/m/auth/clerk`), mirroring
 * the public `/m/$slot/$id` URL. Dynamically rendered at request time via
 * Takumi. Bails 404 when the module is unknown.
 */
export const Route = createFileRoute("/og/m/$slot/$id")({
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

        const summary = index.modules.find((m) => m.category === slot && m.id === id);
        if (!summary) {
          return new Response("Not found", { status: 404 });
        }

        return new ImageResponse(OgCard({ summary }), {
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
