"use client";

import { LineChart } from "@/components/charts/LineChart";
import { formatHour } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { HourlyPoint } from "@/lib/types";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const TICKS = [0, 6, 12, 18, 23].map((hour) => ({ index: hour, label: formatHour(hour) }));

export function LocationHourlyChart({ points }: { points: HourlyPoint[] }) {
  const { t, f } = useI18n();
  const values = HOURS.map(
    (hour) => points.find((point) => point.hourOfDay === hour)?.weightedAverageSpeedKmh ?? null,
  );

  return (
    <LineChart
      ariaLabel={t("Seçili hücrenin saatlik hızı", "Hourly speed of the selected cell")}
      formatValue={f.formatSpeed}
      height={210}
      labels={HOURS.map(formatHour)}
      series={[{ id: "cell", label: t("Hız", "Speed"), color: "var(--series-1)", values }]}
      ticks={TICKS}
    />
  );
}
