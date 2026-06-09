import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { source } from "@/lib/source";

// Serializable docs page metadata for `head()`. Kept out of `docs.$.tsx` so
// it isn't pulled into the RSC bundle by that file's `react-start/rsc` import.
export const getDocMeta = createServerFn({ method: "GET" })
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();
    return {
      path: page.path,
      url: page.url,
      title: page.data.title,
      description: page.data.description,
    };
  });
