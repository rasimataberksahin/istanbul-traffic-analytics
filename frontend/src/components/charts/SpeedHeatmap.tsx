import { MatrixHeatmap } from "@/components/charts/MatrixHeatmap";
import { formatShortDate } from "@/lib/format";
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
  return (
    <MatrixHeatmap
      ariaLabel="Gün ve saate göre ortalama hız ısı haritası"
      cells={cells.map((cell) => ({ row: cell.date, hour: cell.hourOfDay, value: cell.weightedAverageSpeedKmh }))}
      rows={days.map((day) => ({
        key: day.date,
        label: `${formatShortDate(day.date)} ${DAY_ABBREVIATIONS[day.dayName] ?? day.dayName}`,
        title: `${formatShortDate(day.date)}, ${day.dayName}`,
      }))}
    />
  );
}
