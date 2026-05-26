import { cn } from "@/lib/utils";

export type SparkPoint = {
  /** Tooltip label / accessible description (e.g. "2026-04-12"). */
  label: string;
  value: number;
};

type SparkAreaChartProps = {
  data: ReadonlyArray<SparkPoint>;
  /** Aria summary, e.g. "CLI runs per day over the last 30 days". */
  ariaLabel: string;
  /** Render height in pixels. Width is responsive via viewBox. */
  height?: number;
  className?: string;
};

const VIEW_WIDTH = 600;

/**
 * Inspired by Tremor Raw's SparkAreaChart but rendered as a single inline SVG
 * with no charting deps. Monotone-cubic-smoothed line with a soft fill, a
 * baseline ruler, and a "you-are-here" dot on the latest point. Each datapoint
 * has an invisible 4px-wide tooltip target via `<title>` for native hover.
 *
 * Uses `--color-chart-1`/`--color-chart-2` so it tracks the existing greyscale
 * palette and dark-mode switch automatically.
 */
export function SparkAreaChart({ data, ariaLabel, height = 80, className }: SparkAreaChartProps) {
  if (data.length < 2) {
    return (
      <div
        className={cn("flex items-center justify-center text-xs text-muted-foreground", className)}
        style={{ height }}
      >
        Not enough data yet.
      </div>
    );
  }

  const max = data.reduce((acc, point) => Math.max(acc, point.value), 0);
  const safeMax = max === 0 ? 1 : max;
  const stepX = VIEW_WIDTH / (data.length - 1);
  const baselineY = height - 1;
  const points = data.map((point, i) => ({
    x: i * stepX,
    y: height - (point.value / safeMax) * (height - 4) - 2,
    point,
  }));

  const linePath = monotonePath(points);
  const fillPath = `${linePath} L${VIEW_WIDTH.toFixed(2)},${baselineY.toFixed(2)} L0,${baselineY.toFixed(2)} Z`;
  const last = points[points.length - 1];

  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="block size-full overflow-visible"
      >
        <line
          x1={0}
          x2={VIEW_WIDTH}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--color-border)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path d={fillPath} fill="var(--color-chart-1)" fillOpacity={0.35} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-chart-2)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map(({ x, point }) => (
          <rect key={point.label} x={x - 2} y={0} width={4} height={height} fill="transparent">
            <title>{`${point.label}: ${point.value}`}</title>
          </rect>
        ))}
      </svg>
      {/*
       * The chart SVG uses `preserveAspectRatio="none"` so the curve stretches
       * to the container width. That stretches any inline <circle> into a
       * horizontal oval, so the last-point dot lives in the DOM instead and
       * stays perfectly round at any width.
       */}
      {last ? (
        <span
          aria-hidden
          className="pointer-events-none absolute size-[9px] rounded-full border-[1.5px] border-foreground bg-background"
          style={{
            right: 0,
            top: `${(last.y / height) * 100}%`,
            transform: "translate(50%, -50%)",
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson). Produces a smooth curve that
 * never overshoots between samples — important for data viz, where straight
 * Catmull-Rom can wiggle above peaks and misrepresent the dataset.
 */
function monotonePath(points: ReadonlyArray<{ x: number; y: number }>): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) {
    const p = points[0]!;
    return `M${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }

  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    slopes.push((b.y - a.y) / (b.x - a.x));
  }

  const tangents: number[] = Array.from({ length: n }, () => 0);
  tangents[0] = slopes[0]!;
  tangents[n - 1] = slopes[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const prev = slopes[i - 1]!;
    const next = slopes[i]!;
    tangents[i] = prev * next <= 0 ? 0 : (prev + next) / 2;
  }
  // Enforce monotonicity: clamp tangents per Fritsch–Carlson.
  for (let i = 0; i < n - 1; i++) {
    const s = slopes[i]!;
    if (s === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i]! / s;
    const b = tangents[i + 1]! / s;
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      tangents[i] = t * a * s;
      tangents[i + 1] = t * b * s;
    }
  }

  const first = points[0]!;
  let path = `M${first.x.toFixed(2)},${first.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = (b.x - a.x) / 3;
    const c1x = a.x + dx;
    const c1y = a.y + tangents[i]! * dx;
    const c2x = b.x - dx;
    const c2y = b.y - tangents[i + 1]! * dx;
    path += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
  }
  return path;
}
