import {
  ActiveDot,
  Area,
  EvilAreaChart,
  Tooltip,
  XAxis,
} from "@/components/evilcharts/charts/area-chart";
import { type ChartConfig } from "@/components/evilcharts/ui/chart";

type ActivityPoint = { date: string; count: number };

type ActivityChartProps = {
  activity30d: ReadonlyArray<ActivityPoint>;
  isLoading: boolean;
};

const dayLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return dayLabelFormatter.format(date);
}

const activityConfig = {
  count: {
    label: "Runs",
    colors: {
      light: ["var(--color-chart-4)"],
      dark: ["var(--color-chart-1)"],
    },
  },
} satisfies ChartConfig;

/**
 * Pulled into its own module so the route can lazy-import it. Recharts
 * (~140kb gz) lives in this chunk only and never loads until the chart
 * actually renders — direct-nav to /stats paints the chrome and KPIs
 * without paying for it.
 */
export default function ActivityChart({ activity30d, isLoading }: ActivityChartProps) {
  const data = activity30d.map((day) => ({
    count: day.count,
    day: formatDayLabel(day.date),
  }));

  return (
    <EvilAreaChart
      data={data}
      config={activityConfig}
      className="aspect-auto h-24 w-full"
      curveType="monotone"
      animationType="left-to-right"
      isLoading={isLoading}
    >
      <XAxis dataKey="day" hide />
      <Tooltip cursor={false} />
      <Area dataKey="count" variant="gradient" strokeVariant="solid">
        <ActiveDot variant="colored-border" />
      </Area>
    </EvilAreaChart>
  );
}
