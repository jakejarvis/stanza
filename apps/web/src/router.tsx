import { createRouter } from "@tanstack/react-router";

import {
  RouteErrorBoundary,
  RouteNotFoundBoundary,
  RoutePendingBoundary,
} from "@/components/route-boundaries";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultErrorComponent: RouteErrorBoundary,
    defaultNotFoundComponent: RouteNotFoundBoundary,
    defaultPendingComponent: RoutePendingBoundary,
    // Avoid spinner flash on fast loaders; if it does show, keep it visible
    // long enough to feel like a deliberate state.
    defaultPendingMs: 200,
    defaultPendingMinMs: 300,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
