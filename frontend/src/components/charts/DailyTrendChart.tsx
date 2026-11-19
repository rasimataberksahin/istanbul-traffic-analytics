"use client";

import { LineChart } from "@/components/charts/LineChart";
import { formatShortDate, formatSpeed } from "@/lib/format";
import type { DailyPoint } from "@/lib/types";

const WEEKEND_DAYS = new Set(["Cumartesi", "Pazar"]);

export function DailyTrendChart({ points }: { points: DailyPoint[] }) {
  const step = Math.max(1, Math.ceil(points.length / 11));
  const ticks = points
    .map((point, index) => ({ index, label: formatShortDate(point.date) }))
    .filter((tick) => tick.index % step === 0);

  const holiday = points.reduce(
    (best, point, index) =>
      point.hasPublicHoliday &&
      !WEEKEND_DAYS.has(point.dayName) &&
      (best < 0 || point.weightedAverageSpeedKmh > (points[best]?.weightedAverageSpeedKmh ?? 0))
        ? index
        : best,
    -1,
  );
  const holidayPoint = points[holiday];

  return (
    <div>
      <div className="legend">
        <span className="legend-item">
          <span className="key-dot" style={{ background: "var(--series-1)" }} />
          Hafta içi
        </span>
        <span className="legend-item">
          <span className="key-dot" style={{ background: "var(--series-2)" }} />
          Hafta sonu
        </span>
      </div>
      <LineChart
        annotations={
          holidayPoint
            ? [{ seriesId: "daily", index: holiday, text: `${formatShortDate(holidayPoint.date)} tatili`, placement: "above" }]
            : []
        }
        ariaLabel="Günlere göre ortalama hız"
        formatValue={formatSpeed}
        height={250}
        labels={points.map((point) => `${formatShortDate(point.date)}, ${point.dayName}`)}
        pointColors={points.map((point) => (WEEKEND_DAYS.has(point.dayName) ? "var(--series-2)" : "var(--series-1)"))}
        series={[
          {
            id: "daily",
            label: "Ortalama hız",
            color: "var(--series-1)",
            values: points.map((point) => point.weightedAverageSpeedKmh),
          },
        ]}
        ticks={ticks}
      />
    </div>
  );
}
