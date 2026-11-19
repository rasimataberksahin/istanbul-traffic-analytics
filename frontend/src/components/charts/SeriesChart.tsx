"use client";

import { LineChart, type LineAnnotation, type LineSeries } from "@/components/charts/LineChart";
import { formatDecimal, formatIndex, formatSpeed } from "@/lib/format";

export type SeriesUnit = "speed" | "vehicles" | "index" | "hours";

const FORMATTERS: Record<SeriesUnit, (value: number) => string> = {
  speed: formatSpeed,
  vehicles: (value) => `${formatDecimal(value)} araç`,
  index: formatIndex,
  hours: (value) => `${formatDecimal(value)} saat`,
};

interface SeriesChartProps {
  ariaLabel: string;
  labels: string[];
  ticks: { index: number; label: string }[];
  series: LineSeries[];
  unit: SeriesUnit;
  annotations?: LineAnnotation[];
  height?: number;
}

/** Line chart that server components can render, since the formatter is picked by unit name. */
export function SeriesChart({ unit, ...props }: SeriesChartProps) {
  return <LineChart {...props} formatValue={FORMATTERS[unit]} />;
}
