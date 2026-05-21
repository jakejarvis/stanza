import { IconBrandGithub } from "@tabler/icons-react";
import { Link, useLoaderData } from "@tanstack/react-router";

import { ModeToggle } from "@/components/mode-toggle";
import { SiteSearch } from "@/components/search/site-search";
import { Button } from "@/components/ui/button";

const GITHUB_LINK = (
  <a
    href="https://github.com/jakejarvis/stanza"
    target="_blank"
    rel="noreferrer"
    aria-label="GitHub"
  />
);

export function Header() {
  // Root loader stocks the registry index. `useLoaderData` reads it via the
  // typed root-match path so the search popover has data without re-fetching.
  const index = useLoaderData({ from: "__root__" });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold tracking-tight">
            stanza
          </Link>
          <Link
            to="/docs/$"
            params={{ _splat: "" }}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Docs
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <SiteSearch index={index} />
          <Button nativeButton={false} render={GITHUB_LINK} variant="outline">
            <IconBrandGithub data-icon="inline-start" />
            <span className="sr-only">GitHub</span>
          </Button>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
