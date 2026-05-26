import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type BarListEntry = {
  name: string;
  value: number;
  /** Optional element rendered before the name (icon, logo, swatch, etc.). */
  leading?: ReactNode;
  /** Optional label rendered on the right edge of the row (e.g. "62%"). */
  trailing?: string;
  /** Secondary trailing label rendered before `trailing` in a muted weight. */
  trailingSecondary?: string;
  /** Optional href; when set, the bar becomes a link. */
  href?: string;
};

type BarListProps = {
  data: ReadonlyArray<BarListEntry>;
  /** Empty-state copy shown when `data` is empty. */
  emptyMessage?: string;
  className?: string;
};

/**
 * Inspired by Tremor Raw's BarList — a horizontal-bar leaderboard. Each row's
 * bar fills proportionally against the maximum value; the trailing label sits
 * outside the bar for readability against the muted backdrop. Rows are
 * interactive when `href` is set: hover deepens the fill so the affordance is
 * felt across the whole bar, not just the link text.
 */
export function BarList({ data, emptyMessage = "No data yet.", className }: BarListProps) {
  if (data.length === 0) {
    return (
      <p className={cn("py-2 text-xs/relaxed text-muted-foreground/70", className)}>
        {emptyMessage}
      </p>
    );
  }
  const max = data.reduce((acc, entry) => Math.max(acc, entry.value), 0) || 1;
  return (
    <ol className={cn("flex w-full flex-col gap-1", className)}>
      {data.map((entry) => {
        const pct = (entry.value / max) * 100;
        return (
          <li key={entry.name} className="group/row relative h-7">
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 bg-muted transition-colors group-hover/row:bg-foreground/15"
              style={{ width: `${pct}%` }}
            />
            <div className="relative flex h-full items-center justify-between gap-3 px-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                {entry.leading}
                {entry.href ? (
                  <a
                    href={entry.href}
                    className="truncate font-medium text-foreground after:absolute after:inset-0 hover:underline"
                  >
                    {entry.name}
                  </a>
                ) : (
                  <span className="truncate font-medium text-foreground">{entry.name}</span>
                )}
              </div>
              {entry.trailing || entry.trailingSecondary ? (
                <span className="shrink-0 font-mono text-xs tabular-nums">
                  {entry.trailingSecondary ? (
                    <span className="text-muted-foreground/70">{entry.trailingSecondary}</span>
                  ) : null}
                  {entry.trailing ? (
                    <span className={cn("text-foreground", entry.trailingSecondary && "ml-2")}>
                      {entry.trailing}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
