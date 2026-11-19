"use client";

import { LineChart } from "@/components/charts/LineChart";
import { formatHour, formatSpeed } from "@/lib/format";
import type { HourlyPoint } from "@/lib/types";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const TICKS = [0, 6, 12, 18, 23].map((hour) => ({ index: hour, label: formatHour(hour) }));

export function LocationHourlyChart({ points }: { points: HourlyPoint[] }) {
  const values = HOURS.map(
    (hour) => points.find((point) => point.hourOfDay === hour)?.weightedAverageSpeedKmh ?? null,
  );

  return (
    <LineChart
      ariaLabel="Seçili hücrenin hafta içi saatlik hızı"
      formatValue={formatSpeed}
      height={210}
      labels={HOURS.map(formatHour)}
      series={[{ id: "cell", label: "Hafta içi hız", color: "var(--series-1)", values }]}
      ticks={TICKS}
    />
  );
}
