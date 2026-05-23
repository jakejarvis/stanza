import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn, Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import browserCollections from "collections/browser";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsBody } from "fumadocs-ui/layouts/docs/page";
import { RootProvider } from "fumadocs-ui/provider/tanstack";

import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { DocsToc } from "@/components/docs/docs-toc";
import { useMDXComponents } from "@/components/mdx";
import { buildHead, getTechArticleJsonLd } from "@/lib/seo";
import { source } from "@/lib/source";

const serverLoader = createServerFn({ method: "GET" })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();

    return {
      path: page.path,
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      pageTree: await source.serializePageTree(source.getPageTree()),
    };
  });

const clientLoader = browserCollections.docs.createClientLoader({
  id: "docs",
  component({ toc, frontmatter, default: MDX }) {
    return (
      <div className="xl:flex xl:gap-8">
        <article className="min-w-0 flex-1 pt-2 pb-8 md:pt-8">
          <h1 className="text-3xl font-semibold tracking-tight">{frontmatter.title}</h1>
          {frontmatter.description && (
            <p className="mt-2 text-base leading-normal text-muted-foreground">
              {frontmatter.description}
            </p>
          )}
          <DocsBody className="mt-8">
            <MDX components={useMDXComponents()} />
          </DocsBody>
        </article>
        <DocsToc toc={toc} />
      </div>
    );
  },
});

export const Route = createFileRoute("/docs/$")({
  component: Page,
  loader: async ({ params }) => {
    // `_splat` is TanStack Router's catch-all param; bracket access dodges the
    // no-underscore-dangle lint rule on a name we don't control.
    const slugs = params["_splat"]?.split("/").filter(Boolean) ?? [];
    const data = await serverLoader({ data: slugs });
    await clientLoader.preload(data.path);
    return data;
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
  const data = useFumadocsLoader(Route.useLoaderData());

  return (
    <RootProvider theme={{ enabled: false }} search={{ enabled: false }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="md:flex md:gap-8">
          <DocsSidebar tree={data.pageTree} />
          <div className="min-w-0 flex-1">
            <Hydrate when={load()}>{clientLoader.useContent(data.path)}</Hydrate>
          </div>
        </div>
      </div>
    </RootProvider>
  );
}
