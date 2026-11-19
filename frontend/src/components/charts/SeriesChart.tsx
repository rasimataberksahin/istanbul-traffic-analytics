"use client";

import { LineChart, type LineAnnotation, type LineSeries } from "@/components/charts/LineChart";
import { useI18n } from "@/lib/i18n/client";

export type SeriesUnit = "speed" | "vehicles" | "index" | "hours";

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
  const { t, f } = useI18n();
  const formatters: Record<SeriesUnit, (value: number) => string> = {
    speed: f.formatSpeed,
    vehicles: (value) => `${f.formatDecimal(value)} ${t("araç", "vehicles")}`,
    index: f.formatIndex,
    hours: (value) => `${f.formatDecimal(value)} ${t("saat", "hours")}`,
  };
  return <LineChart {...props} formatValue={formatters[unit]} />;
}
