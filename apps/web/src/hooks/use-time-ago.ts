import { useEffect, useState } from "react";

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

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
  if (abs < MINUTE) return relativeFormatter.format(0, "second");
  if (abs < HOUR) return relativeFormatter.format(Math.round(diffSec / MINUTE), "minute");
  if (abs < DAY) return relativeFormatter.format(Math.round(diffSec / HOUR), "hour");
  if (abs < MONTH) return relativeFormatter.format(Math.round(diffSec / DAY), "day");
  if (abs < YEAR) return relativeFormatter.format(Math.round(diffSec / MONTH), "month");
  return relativeFormatter.format(Math.round(diffSec / YEAR), "year");
}

/**
 * Reactive `Intl.RelativeTimeFormat`. Defers reading `new Date()` to a
 * post-mount effect so SSR + first hydration agree on a stable fallback (the
 * raw iso), then we swap to the formatted relative label once the client clock
 * is available. Re-renders on a fixed interval so the label stays fresh.
 */
export function useTimeAgo(iso: string, intervalMs = 30_000): string {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now ? format(iso, now) : iso;
}
