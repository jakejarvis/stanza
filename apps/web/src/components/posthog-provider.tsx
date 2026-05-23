import { posthog } from "posthog-js";
import { PostHogProvider as PostHogReactProvider } from "posthog-js/react";

/**
 * Client-side PostHog. Initializes the browser SDK once, but only when a key is
 * configured (`VITE_PUBLIC_POSTHOG_KEY`) — local dev and self-hosters without
 * analytics get an uninitialized singleton that no-ops on capture, mirroring the
 * `/api/events` proxy's "no key → do nothing" behavior.
 *
 * Auto-captures pageviews + pageleaves (history-based, for the SPA router) and
 * web vitals; DOM click autocapture and session replay are off.
 */

const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;

// oxlint-disable-next-line no-underscore-dangle
if (typeof window !== "undefined" && key && !posthog.__loaded) {
  posthog.init(key, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    capture_pageview: "history_change",
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    person_profiles: "never",
  });
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <PostHogReactProvider client={posthog}>{children}</PostHogReactProvider>;
}
