import { IconBrandGithub } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="font-semibold tracking-tight">
          stanza
        </Link>
        <nav className="flex items-center gap-1">
          <Button
            render={
              <a
                href="https://github.com/jakejarvis/stanza"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              />
            }
            variant="ghost"
            size="sm"
          >
            <IconBrandGithub className="size-4" />
            <span className="hidden sm:inline">GitHub</span>
          </Button>
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}
