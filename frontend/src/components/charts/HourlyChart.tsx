"use client";

import { LineChart, type LineAnnotation, type LineSeries } from "@/components/charts/LineChart";
import { formatHour } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { DayTypeComparisonPoint, HourlyPoint } from "@/lib/types";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const TICKS = HOURS.filter((hour) => hour % 3 === 0).map((hour) => ({ index: hour, label: formatHour(hour) }));

function slowestAnnotation(series: LineSeries, formatDecimal: (value: number) => string): LineAnnotation | null {
  let slowest: number | null = null;
  series.values.forEach((value, index) => {
    if (value !== null && (slowest === null || value < (series.values[slowest] ?? Infinity))) {
      slowest = index;
    }
  });
  if (slowest === null) {
    return null;
  }
  const value = series.values[slowest];
  return { seriesId: series.id, index: slowest, text: `${formatHour(slowest)}: ${formatDecimal(value ?? 0)}` };
}

interface HourlyChartProps {
  comparison: DayTypeComparisonPoint[];
  hourly: HourlyPoint[];
  showComparison: boolean;
}

export function HourlyChart({ comparison, hourly, showComparison }: HourlyChartProps) {
  const { t, f } = useI18n();
  const byHour = <T extends { hourOfDay: number }>(points: T[], read: (point: T) => number | null) =>
    HOURS.map((hour) => {
      const point = points.find((candidate) => candidate.hourOfDay === hour);
      return point ? read(point) : null;
    });

  const series: LineSeries[] = showComparison
    ? [
        { id: "weekday", label: t("Hafta içi", "Weekdays"), color: "var(--series-1)", values: byHour(comparison, (point) => point.weekdaySpeedKmh) },
        { id: "weekend", label: t("Hafta sonu", "Weekends"), color: "var(--series-2)", values: byHour(comparison, (point) => point.weekendSpeedKmh) },
      ]
    : [{ id: "speed", label: t("Ortalama hız", "Average speed"), color: "var(--series-1)", values: byHour(hourly, (point) => point.weightedAverageSpeedKmh) }];

  const annotation = series[0] ? slowestAnnotation(series[0], f.formatDecimal) : null;

  return (
    <LineChart
      annotations={annotation ? [annotation] : []}
      ariaLabel={t("Saatlere göre ortalama hız", "Average speed by hour")}
      formatValue={f.formatSpeed}
      labels={HOURS.map(formatHour)}
      series={series}
      ticks={TICKS}
    />
  );
}
