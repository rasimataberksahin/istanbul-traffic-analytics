"use client";

import { LineChart } from "@/components/charts/LineChart";
import { useI18n } from "@/lib/i18n/client";
import { dayName } from "@/lib/i18n/terms";
import type { DailyPoint } from "@/lib/types";

const WEEKEND_DAYS = new Set(["Cumartesi", "Pazar"]);

export function DailyTrendChart({ points }: { points: DailyPoint[] }) {
  const { locale, t, f } = useI18n();
  const { formatShortDate, formatSpeed } = f;
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
          {t("Hafta içi", "Weekday")}
        </span>
        <span className="legend-item">
          <span className="key-dot" style={{ background: "var(--series-2)" }} />
          {t("Hafta sonu", "Weekend")}
        </span>
      </div>
      <LineChart
        annotations={
          holidayPoint
            ? [{ seriesId: "daily", index: holiday, text: t(`${formatShortDate(holidayPoint.date)} tatili`, `${formatShortDate(holidayPoint.date)} holiday`), placement: "above" }]
            : []
        }
        ariaLabel={t("Günlere göre ortalama hız", "Average speed by day")}
        formatValue={formatSpeed}
        height={250}
        labels={points.map((point) => `${formatShortDate(point.date)}, ${dayName(point.dayName, locale)}`)}
        pointColors={points.map((point) => (WEEKEND_DAYS.has(point.dayName) ? "var(--series-2)" : "var(--series-1)"))}
        series={[
          {
            id: "daily",
            label: t("Ortalama hız", "Average speed"),
            color: "var(--series-1)",
            values: points.map((point) => point.weightedAverageSpeedKmh),
          },
        ]}
        ticks={ticks}
      />
    </div>
  );
}
