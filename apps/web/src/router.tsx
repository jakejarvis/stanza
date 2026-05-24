import { createRouter } from "@tanstack/react-router";

import { RouteErrorBoundary, RouteNotFoundBoundary } from "@/components/route-boundaries";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultErrorComponent: RouteErrorBoundary,
    defaultNotFoundComponent: RouteNotFoundBoundary,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
