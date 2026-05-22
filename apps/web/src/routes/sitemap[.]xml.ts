import type { RegistryIndex } from "@stanza/registry";
import { createFileRoute } from "@tanstack/react-router";

import { source } from "@/lib/source";
import { loadRegistryFile } from "@/server/registry-base.server";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;

        let index: RegistryIndex;
        try {
          index = await loadRegistryFile<RegistryIndex>("index.json");
        } catch {
          return new Response("Registry unavailable", { status: 502 });
        }

        const urls = [
          { loc: `${origin}/`, priority: "1.0" },
          ...source.getPages().map((p) => ({
            loc: `${origin}${p.url}`,
          })),
          ...index.modules.map((m) => ({
            loc: `${origin}/m/${m.category}/${m.id}`,
          })),
        ];

        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${"priority" in u ? `<priority>${u.priority}</priority>` : ""}</url>`).join("\n")}
</urlset>
`;

        return new Response(body, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600, s-maxage=86400",
          },
        });
      },
    },
  },
});
