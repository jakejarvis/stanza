import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});

/**
 * Convert a `/docs/*.md` URL path into loader slugs: strip the trailing `.md`
 * and collapse a lone `index` to the docs root. Used by the per-page markdown
 * route and the `Accept`-header content negotiation middleware.
 */
export function markdownPathToSlugs(segs: string[]) {
  if (segs.length === 0) return [];
  const out = [...segs];
  const last = out.length - 1;
  out[last] = (out[last] ?? "").replace(/\.md$/, "");
  if (out.length === 1 && out[0] === "index") out.pop();
  return out;
}

/**
 * Render a single docs page as LLM-friendly Markdown. Requires
 * `includeProcessedMarkdown` to be enabled on the docs collection
 * above, which exposes `getText("processed")`.
 */
export async function getLLMText(page: (typeof source)["$inferPage"]) {
  const processed = await page.data.getText("processed");
  return `# ${page.data.title} (${page.url})\n\n${processed}`;
}
