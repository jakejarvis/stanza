import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import browserCollections from "collections/browser";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { Suspense } from "react";

import { useMDXComponents } from "@/components/mdx";
import { baseOptions } from "@/lib/layout.shared";
import { buildHead } from "@/lib/seo";
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
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
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
  head: ({ loaderData }) =>
    buildHead({
      title: loaderData?.title,
      description: loaderData?.description,
      path: loaderData?.url ?? "/docs",
    }),
});

function Page() {
  const data = useFumadocsLoader(Route.useLoaderData());

  return (
    <RootProvider theme={{ enabled: false }} search={{ enabled: false }}>
      <DocsLayout {...baseOptions()} tree={data.pageTree}>
        <Suspense>{clientLoader.useContent(data.path)}</Suspense>
      </DocsLayout>
    </RootProvider>
  );
}
