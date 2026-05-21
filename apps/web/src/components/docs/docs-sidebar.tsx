import { Link, useRouterState } from "@tanstack/react-router";
import type { Node, Root } from "fumadocs-core/page-tree";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

function toSplat(url: string): string {
  return url.replace(/^\/docs\/?/, "");
}

function normalize(path: string): string {
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

function NavLink({ url, name, pathname }: { url: string; name: ReactNode; pathname: string }) {
  const active = normalize(pathname) === normalize(url);
  return (
    <li>
      <Link
        to="/docs/$"
        params={{ _splat: toSplat(url) }}
        className={cn(
          "block px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
          active && "bg-accent font-medium text-accent-foreground",
        )}
      >
        {name}
      </Link>
    </li>
  );
}

function NavNode({ node, pathname }: { node: Node; pathname: string }) {
  if (node.type === "separator") {
    return (
      <li className="px-2 pt-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground/70">
        {node.name}
      </li>
    );
  }

  if (node.type === "folder") {
    return (
      <li className="pt-2">
        <p className="px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground/70">
          {node.name}
        </p>
        <ul className="space-y-0.5">
          {node.index && (
            <NavLink url={node.index.url} name={node.index.name} pathname={pathname} />
          )}
          {node.children.map((child, i) => (
            <NavNode key={child.$id ?? i} node={child} pathname={pathname} />
          ))}
        </ul>
      </li>
    );
  }

  return <NavLink url={node.url} name={node.name} pathname={pathname} />;
}

function NavList({ nodes, pathname }: { nodes: Node[]; pathname: string }) {
  return (
    <ul className="space-y-0.5 text-sm">
      {nodes.map((node, i) => (
        <NavNode key={node.$id ?? i} node={node} pathname={pathname} />
      ))}
    </ul>
  );
}

export function DocsSidebar({ tree }: { tree: Root }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const list = <NavList nodes={tree.children} pathname={pathname} />;

  return (
    <>
      {/* Mobile: a disclosure above the content so docs stay navigable < md. */}
      <details className="mb-6 border-b border-border pb-4 md:hidden">
        <summary className="cursor-pointer px-2 py-1 text-sm font-medium">Documentation</summary>
        <div className="mt-3">{list}</div>
      </details>

      {/* Desktop: sticky left rail aligned to the page frame. */}
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="sticky top-14 max-h-[calc(100svh-3.5rem)] overflow-y-auto py-8 pr-4">
          {list}
        </div>
      </aside>
    </>
  );
}
