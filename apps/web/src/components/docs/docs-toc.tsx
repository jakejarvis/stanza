import { AnchorProvider, useActiveAnchor } from "fumadocs-core/toc";
import type { TOCItemType } from "fumadocs-core/toc";

import { cn } from "@/lib/utils";

function TocList({ toc }: { toc: TOCItemType[] }) {
  const active = useActiveAnchor();

  return (
    <ul className="space-y-0.5 text-sm">
      {toc.map((item) => {
        const id = item.url.split("#")[1];
        const isActive = id === active;
        return (
          <li key={item.url}>
            <a
              href={item.url}
              style={{ paddingLeft: `${0.5 + Math.max(0, item.depth - 2) * 0.75}rem` }}
              className={cn(
                "block py-1 text-muted-foreground transition-colors hover:text-foreground",
                isActive && "font-medium text-foreground",
              )}
            >
              {item.title}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function DocsToc({ toc }: { toc: TOCItemType[] }) {
  if (toc.length === 0) return null;

  return (
    <aside className="hidden w-56 shrink-0 xl:block">
      <div className="sticky top-14 max-h-[calc(100svh-3.5rem)] overflow-y-auto py-8">
        <p className="mb-2 px-2 text-xs font-medium tracking-wide text-muted-foreground/70">
          On this page
        </p>
        <AnchorProvider toc={toc}>
          <TocList toc={toc} />
        </AnchorProvider>
      </div>
    </aside>
  );
}
