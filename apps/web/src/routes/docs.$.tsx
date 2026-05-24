import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { DocsBody } from "fumadocs-ui/layouts/docs/page";
import { RootProvider } from "fumadocs-ui/provider/tanstack";

import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { DocsToc } from "@/components/docs/docs-toc";
import { getMDXComponents } from "@/components/mdx";
import { buildHead, getTechArticleJsonLd } from "@/lib/seo";
import { source } from "@/lib/source";
import { getDocMeta } from "@/server/docs-meta.functions";

// Render the docs layout (sidebar + article + TOC) as one RSC fragment.
// Fumadocs' `pageTree.name` and `TOCItemType.title` are typed as `ReactNode`,
// so they can't ride along in JSON loader data — but inside an RSC fragment
// they flow through React Flight natively. Client components in the tree ship
// as `'use client'` references and hydrate normally.
const getDocLayout = createServerFn({ method: "GET" })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();
    const MDX = page.data.body;
    return await renderServerComponent(
      <RootProvider theme={{ enabled: false }} search={{ enabled: false }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="md:flex md:gap-8">
            <DocsSidebar tree={source.getPageTree()} />
            <div className="min-w-0 flex-1">
              <div className="xl:flex xl:gap-8">
                <article className="min-w-0 flex-1 pt-2 pb-8 md:pt-8">
                  <h1 className="text-3xl font-medium tracking-tight">{page.data.title}</h1>
                  {page.data.description && (
                    <p className="mt-2 text-base leading-normal text-muted-foreground">
                      {page.data.description}
                    </p>
                  )}
                  <DocsBody className="mt-8">
                    <MDX components={getMDXComponents()} />
                  </DocsBody>
                </article>
                <DocsToc toc={page.data.toc} />
              </div>
            </div>
          </div>
        </div>
      </RootProvider>,
    );
  });

export const Route = createFileRoute("/docs/$")({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params["_splat"]?.split("/").filter(Boolean) ?? [];
    const [meta, Content] = await Promise.all([
      getDocMeta({ data: slugs }),
      getDocLayout({ data: slugs }),
    ]);
    return { ...meta, Content };
  },
  head: ({ loaderData }) => {
    const path = loaderData?.url ?? "/docs";
    const title = loaderData?.title;
    const description = loaderData?.description;
    return buildHead({
      title,
      description,
      path,
      ogImage: loaderData ? `/og${loaderData.url}` : undefined,
      markdownPath: loaderData ? `${path}.md` : undefined,
      jsonLd:
        loaderData && title
          ? [getTechArticleJsonLd({ title, description: description ?? "", path })]
          : undefined,
    });
  },
});

function Page() {
  const { Content } = Route.useLoaderData();
  return <>{Content}</>;
}
