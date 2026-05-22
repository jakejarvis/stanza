import { TanStackDevtools } from "@tanstack/react-devtools";
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Analytics } from "@vercel/analytics/react";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { PostHogProvider } from "@/components/posthog-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { getRegistryIndex } from "@/server/registry-index.functions";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  loader: () => getRegistryIndex(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorState,
});

function CenteredMessage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center sm:py-32">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex items-center gap-3">{children}</div>
    </div>
  );
}

function NotFound() {
  return (
    <CenteredMessage
      title="Page not found"
      description="That page doesn’t exist. It may have moved, or the URL might be wrong."
    >
      <Button render={<Link to="/" />} nativeButton={false} variant="outline" size="sm">
        ← Back to builder
      </Button>
    </CenteredMessage>
  );
}

function ErrorState({ error }: { error: Error }) {
  return (
    <CenteredMessage
      title="Something went wrong"
      description={error?.message || "An unexpected error occurred while rendering this page."}
    >
      <Button render={<Link to="/" />} nativeButton={false} variant="outline" size="sm">
        ← Back to builder
      </Button>
    </CenteredMessage>
  );
}

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background font-sans text-foreground tabular-nums antialiased">
        <PostHogProvider>
          <ThemeProvider defaultTheme="system" storageKey="stanza-theme">
            <div className="flex min-h-svh flex-col">
              <Header />
              <main className="flex-1">
                <Outlet />
              </main>
              <Footer />
            </div>
            <Toaster />
          </ThemeProvider>
        </PostHogProvider>
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[{ name: "TanStack Router", render: <TanStackRouterDevtoolsPanel /> }]}
        />
        <Analytics />
        <Scripts />
      </body>
    </html>
  );
}
