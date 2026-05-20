import type { RegistryIndex } from "@stanza/registry";
import { ImageResponse } from "@vercel/og";
import { defineHandler, getRouterParams } from "nitro/h3";

import { OgCard } from "@/server/og-card";
import { loadRegistryFile } from "@/server/registry-base";

/**
 * `/og/$slot/$id` — per-module OG card. Dynamically rendered at request time
 * via Satori (bundled inside `@vercel/og`). Looks the module up in the
 * registry index and bails 404 if it's not there.
 */
export default defineHandler(async (event) => {
  const params = getRouterParams(event);
  const slot = String(params.slot ?? "");
  const id = String(params.id ?? "").replace(/\.png$/, "");
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
});
