"use client";

import { MatrixHeatmap } from "@/components/charts/MatrixHeatmap";
import { useI18n } from "@/lib/i18n/client";
import { dayName } from "@/lib/i18n/terms";
import type { DailyPoint, HeatmapCell } from "@/lib/types";

const DAY_ABBREVIATIONS: Record<string, string> = {
  Pazartesi: "Pzt",
  Salı: "Sal",
  Çarşamba: "Çar",
  Perşembe: "Per",
  Cuma: "Cum",
  Cumartesi: "Cmt",
  Pazar: "Paz",
};

/** Day by hour speed matrix of the selected period. */
export function SpeedHeatmap({ cells, days }: { cells: HeatmapCell[]; days: DailyPoint[] }) {
  const { locale, t, f } = useI18n();
  const { formatShortDate } = f;
  const shortDay = (name: string) => dayName(DAY_ABBREVIATIONS[name] ?? name, locale);
  return (
    <MatrixHeatmap
      ariaLabel={t("Gün ve saate göre ortalama hız ısı haritası", "Average speed by day and hour")}
      cells={cells.map((cell) => ({ row: cell.date, hour: cell.hourOfDay, value: cell.weightedAverageSpeedKmh }))}
      rows={days.map((day) => ({
        key: day.date,
        label: `${formatShortDate(day.date)} ${shortDay(day.dayName)}`,
        title: `${formatShortDate(day.date)}, ${dayName(day.dayName, locale)}`,
      }))}
    />
  );
}
