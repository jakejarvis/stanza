import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { isMarkdownPreferred } from "fumadocs-core/negotiation";

import { getLLMText, markdownPathToSlugs, source } from "@/lib/source";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Accept-header content negotiation: serve markdown for `/docs/*` when the
// client prefers `text/markdown`.
const llmMiddleware = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
  const { pathname } = new URL(request.url);

  if (pathname.startsWith("/docs") && isMarkdownPreferred(request)) {
    const segs = pathname.slice("/docs".length).split("/").filter(Boolean);
    const page = source.getPage(markdownPathToSlugs(segs));
    if (page) {
      return new Response(await getLLMText(page), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "cache-control": "public, max-age=3600, s-maxage=86400",
        },
      });
    }
  }

  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, llmMiddleware],
}));
