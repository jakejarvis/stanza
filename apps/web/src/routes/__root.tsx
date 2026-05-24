import { TanStackDevtools } from "@tanstack/react-devtools";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { NavigationProgress } from "@/components/navigation-progress";
import { PostHogProvider } from "@/components/posthog-provider";
import { RouteErrorBoundary, RouteNotFoundBoundary } from "@/components/route-boundaries";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getDocsIndex } from "@/server/docs-index.functions";
import { getRegistryIndex } from "@/server/registry-index.functions";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  loader: async () => {
    const [registry, docs] = await Promise.all([getRegistryIndex(), getDocsIndex()]);
    return { registry, docs };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#ffffff", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#0a0a0a", media: "(prefers-color-scheme: dark)" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: RouteNotFoundBoundary,
  errorComponent: RouteErrorBoundary,
});

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background font-sans text-foreground tabular-nums antialiased">
        <PostHogProvider>
          <ThemeProvider defaultTheme="system" storageKey="stanza-theme">
            <a
              href="#main"
              className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:rounded-none focus-visible:border focus-visible:border-border focus-visible:bg-background focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:ring-2 focus-visible:ring-ring"
            >
              Skip to content
            </a>
            <NavigationProgress />
            <div className="flex min-h-svh flex-col">
              <Header />
              <main id="main" className="flex-1">
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
        <Scripts />
      </body>
    </html>
  );
}
