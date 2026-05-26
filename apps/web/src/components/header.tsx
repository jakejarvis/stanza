import { IconBrandGithub } from "@tabler/icons-react";
import { Link, useLoaderData } from "@tanstack/react-router";

import { Logo } from "@/components/logo";
import { SiteSearch } from "@/components/search/site-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function Header() {
  // Root loader stocks the registry index + a lightweight docs page list.
  const { registry, docs } = useLoaderData({ from: "__root__" });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-5">
          <Link to="/" aria-label="Stanza" className="mr-1">
            <Logo className="size-6" />
            <span className="sr-only">Stanza</span>
          </Link>
          <Link
            to="/docs/$"
            params={{ _splat: "" }}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Docs
          </Link>
          <Link
            to="/stats"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Stats
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <SiteSearch registry={registry} docs={docs} />
          <Button
            nativeButton={false}
            render={
              <a
                href="https://github.com/jakejarvis/stanza"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              />
            }
            variant="outline"
            size="icon"
          >
            <IconBrandGithub className="text-muted-foreground" aria-hidden />
            <span className="sr-only">GitHub</span>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
