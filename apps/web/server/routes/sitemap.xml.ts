import type { RegistryIndex } from "@stanza/registry";
import type { H3Event } from "nitro/h3";
import { defineHandler, getRequestHost, getRequestProtocol } from "nitro/h3";

import { loadRegistryFile } from "@/server/registry-base";

/**
 * `/sitemap.xml` — enumerates the home plus every module detail page. Search
 * params (peer overrides) are intentionally excluded: the canonical URL for a
 * module is the bare `/m/$slot/$id`, and the page renders an auto-default
 * adapter from there.
 */
export default defineHandler(async (event) => {
  const origin = originFromEvent(event);
  let index: RegistryIndex;
  try {
    index = await loadRegistryFile<RegistryIndex>("index.json");
  } catch {
    return new Response("Registry unavailable", { status: 502 });
  }

  const urls = [
    { loc: `${origin}/`, changefreq: "weekly", priority: "1.0" },
    ...index.modules.map((m) => ({
      loc: `${origin}/m/${m.slot}/${m.id}`,
      changefreq: "monthly",
      priority: "0.7",
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
  )
  .join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
});

function originFromEvent(event: H3Event): string {
  const host = getRequestHost(event);
  const proto = getRequestProtocol(event);
  return `${proto}://${host}`;
}
