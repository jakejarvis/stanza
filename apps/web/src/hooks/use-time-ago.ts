import { useEffect, useState } from "react";

const relativeFormatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function format(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < MINUTE) return relativeFormatter.format(diffSec, "second");
  if (abs < HOUR) return relativeFormatter.format(Math.round(diffSec / MINUTE), "minute");
  if (abs < DAY) return relativeFormatter.format(Math.round(diffSec / HOUR), "hour");
  if (abs < MONTH) return relativeFormatter.format(Math.round(diffSec / DAY), "day");
  if (abs < YEAR) return relativeFormatter.format(Math.round(diffSec / MONTH), "month");
  return relativeFormatter.format(Math.round(diffSec / YEAR), "year");
}

/**
 * Reactive `Intl.RelativeTimeFormat` — re-renders on a fixed interval so the
 * label stays fresh while the tab is open. SSR returns a value computed against
 * server time; gate the rendered element on client-only state if exact
 * second-level accuracy at hydration matters.
 */
export function useTimeAgo(iso: string, intervalMs = 30_000): string {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return format(iso, now);
}
