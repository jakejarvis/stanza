import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-[13px] text-muted-foreground sm:flex-row sm:px-6">
        <p>
          Made with 🥡 by{" "}
          <a
            href="https://github.com/jakejarvis"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            @jakejarvis
          </a>
          .
        </p>
        <nav className="flex items-center gap-5">
          <span>v{__APP_VERSION__ ?? "0.0.0"}</span>
          <Link to="/docs/$" params={{ _splat: "" }}>
            Docs
          </Link>
          <Link to="/stats">Stats</Link>
          <a
            href="https://github.com/jakejarvis/stanza"
            className="hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
