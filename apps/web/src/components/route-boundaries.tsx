import { IconHome, IconRefresh } from "@tabler/icons-react";
import { ErrorComponent, type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

/**
 * Shared layout for every route-boundary state (error, not-found, pending).
 * Mirrors the centered-message pattern that lived inline in `__root.tsx`.
 */
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
      <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex items-center gap-3">{children}</div>
    </div>
  );
}

const GENERIC_ERROR_MESSAGE =
  "Something broke while loading this page. Try again, or head back to the builder.";

/**
 * Default error component for the router. Re-runs the loader on Try again via
 * `router.invalidate()` (the TanStack-recommended retry path — `reset()` only
 * clears UI without re-fetching).
 */
export function RouteErrorBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();

  const description = import.meta.env.DEV
    ? (error.message ?? GENERIC_ERROR_MESSAGE)
    : GENERIC_ERROR_MESSAGE;

  return (
    <>
      <CenteredMessage title="Something went wrong" description={description}>
        <Button
          onClick={() => {
            void router.invalidate();
          }}
          variant="default"
          size="sm"
        >
          <IconRefresh aria-hidden="true" data-icon="inline-start" />
          Try again
        </Button>
        <Button render={<Link to="/" />} nativeButton={false} variant="outline" size="sm">
          <IconHome aria-hidden="true" data-icon="inline-start" />
          Return home
        </Button>
      </CenteredMessage>
      {import.meta.env.DEV && (
        <div className="mx-auto max-w-3xl px-4 pb-12 sm:px-6">
          <ErrorComponent error={error} />
        </div>
      )}
    </>
  );
}

export function RouteNotFoundBoundary() {
  return (
    <CenteredMessage
      title="Page not found"
      description="We couldn’t find that page. It may have moved, or the URL might be wrong."
    >
      <Button render={<Link to="/" />} nativeButton={false} variant="outline" size="sm">
        <IconHome aria-hidden="true" data-icon="inline-start" />
        Return home
      </Button>
    </CenteredMessage>
  );
}
