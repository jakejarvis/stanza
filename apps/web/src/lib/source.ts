import { docs } from "collections/server";
import type { Node } from "fumadocs-core/page-tree";
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
  return `# ${page.data.title} (${page.url})\n\n${page.data.description ? `> ${page.data.description.trim()}\n\n` : ""}${processed.trimStart()}`;
}

/**
 * Walk `source.pageTree` and yield pages in the order declared by `meta.json`
 * (recursively into folders). `source.getPages()` returns filesystem order;
 * the tree honors the sidebar order, which is what users see.
 */
export function getOrderedPages() {
  const out: (typeof source)["$inferPage"][] = [];
  const visit = (nodes: Node[]) => {
    for (const node of nodes) {
      if (node.type === "page") {
        const page = source.getNodePage(node);
        if (page) out.push(page);
      } else if (node.type === "folder") {
        if (node.index) {
          const page = source.getNodePage(node.index);
          if (page) out.push(page);
        }
        visit(node.children);
      }
    }
  };
  visit(source.getPageTree().children);
  return out;
}
