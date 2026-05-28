import { useEffect, useState, type ReactNode } from "react";

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
 *
 * Bars carry an EvilCharts-style diagonal hatch laid over a horizontal gradient,
 * and grow in from 0% on mount with a small per-row stagger so the leaderboard
 * settles into place instead of flashing fully-formed.
 */
export function BarList({ data, emptyMessage = "No data yet.", className }: BarListProps) {
  // Bars render at width 0 on first commit, then transition to their real
  // width once `mounted` flips after the initial paint. Without the deferred
  // flip, the transition would have nothing to interpolate from.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (data.length === 0) {
    return (
      <p
        role="status"
        aria-live="polite"
        className={cn("py-2 text-xs/relaxed text-muted-foreground/70", className)}
      >
        {emptyMessage}
      </p>
    );
  }
  const max = data.reduce((acc, entry) => Math.max(acc, entry.value), 0) || 1;
  return (
    <ol className={cn("flex w-full flex-col gap-1", className)}>
      {data.map((entry, idx) => {
        const pct = (entry.value / max) * 100;
        return (
          <li key={entry.name} className="group/row relative h-7 overflow-hidden">
            <div
              aria-hidden="true"
              className={cn(
                "absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-muted via-muted/70 to-muted/30 transition-transform duration-700 ease-out motion-reduce:transition-none",
                "group-hover/row:from-foreground/20 group-hover/row:via-foreground/12 group-hover/row:to-foreground/5",
              )}
              style={{
                transform: `scaleX(${mounted ? pct / 100 : 0})`,
                transitionDelay: `${Math.min(idx * 40, 240)}ms`,
              }}
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[image:repeating-linear-gradient(135deg,currentColor_0_1px,transparent_1px_5px)] text-foreground opacity-[0.07] transition-opacity duration-300 group-hover/row:opacity-[0.14] motion-reduce:transition-none"
              />
            </div>
            <div className="relative flex h-full items-center justify-between gap-3 px-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                {entry.leading}
                {entry.href ? (
                  <a
                    href={entry.href}
                    className="truncate font-medium text-foreground after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
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
