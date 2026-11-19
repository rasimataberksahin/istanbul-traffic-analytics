import type { CalendarDay, MonthlyInsight, PeriodKind, PeriodProfilePoint, ReliabilityPoint } from "@/lib/types";

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  school_term: "Okul dönemi",
  school_break: "Yarıyıl ve ara tatil",
  summer_break: "Yaz tatili",
  ramadan: "Ramazan",
};

export const PERIOD_ORDER: PeriodKind[] = ["school_term", "school_break", "summer_break", "ramadan"];

/** A weekday needs most of its hours to be compared with other days. */
export const MINIMUM_DAY_HOURS = 20;

export interface YearPair {
  monthIndex: number;
  previous: number | null;
  current: number | null;
  change: number | null;
}

export interface YearComparison {
  previousYear: number;
  currentYear: number;
  pairs: YearPair[];
  /** Mean of the monthly changes where both years have a value. */
  averageChange: number | null;
}

const yearOf = (month: string) => Number(month.slice(0, 4));
const monthIndexOf = (month: string) => Number(month.slice(5, 7)) - 1;

/**
 * Compares the latest year that has at least six loaded months with the year before.
 * Returns null when there is nothing to compare.
 */
export function compareYears(
  months: MonthlyInsight[],
  read: (month: MonthlyInsight) => number | null,
): YearComparison | null {
  const counts = new Map<number, number>();
  for (const month of months) {
    counts.set(yearOf(month.month), (counts.get(yearOf(month.month)) ?? 0) + 1);
  }
  const currentYear = [...counts.entries()]
    .filter(([, count]) => count >= 6)
    .map(([year]) => year)
    .sort((a, b) => b - a)
    .find((year) => counts.has(year - 1));
  if (currentYear === undefined) {
    return null;
  }

  const valueAt = (year: number, monthIndex: number) => {
    const month = months.find((item) => yearOf(item.month) === year && monthIndexOf(item.month) === monthIndex);
    return month ? read(month) : null;
  };

  const pairs = Array.from({ length: 12 }, (_, monthIndex) => {
    const previous = valueAt(currentYear - 1, monthIndex);
    const current = valueAt(currentYear, monthIndex);
    return {
      monthIndex,
      previous,
      current,
      change: previous === null || current === null ? null : Number((current - previous).toFixed(2)),
    };
  });
  const changes = pairs.map((pair) => pair.change).filter((change): change is number => change !== null);

  return {
    previousYear: currentYear - 1,
    currentYear,
    pairs,
    averageChange: changes.length ? changes.reduce((sum, change) => sum + change, 0) / changes.length : null,
  };
}

/** Regular weekdays with enough data, which can be ranked against each other. */
export function comparableWeekdays(days: CalendarDay[]): (CalendarDay & { eveningSpeedKmh: number })[] {
  return days.filter(
    (day): day is CalendarDay & { eveningSpeedKmh: number } =>
      !day.isWeekend && !day.hasPublicHoliday && day.observedHours >= MINIMUM_DAY_HOURS && day.eveningSpeedKmh !== null,
  );
}

/** The slowest and fastest regular weekdays by evening peak speed. */
export function rankWeekdays(days: CalendarDay[], count: number) {
  const ranked = [...comparableWeekdays(days)].sort((a, b) => a.eveningSpeedKmh - b.eveningSpeedKmh);
  return { slowest: ranked.slice(0, count), fastest: ranked.slice(-count).reverse() };
}

export interface PeriodProfile {
  period: PeriodKind;
  days: number;
  speeds: (number | null)[];
  vehicles: (number | null)[];
}

/** Groups the API rows into one 24-hour profile per period, in a fixed order. */
export function groupPeriods(points: PeriodProfilePoint[]): PeriodProfile[] {
  return PERIOD_ORDER.flatMap((period) => {
    const rows = points.filter((point) => point.period === period);
    if (rows.length === 0) {
      return [];
    }
    const byHour = (read: (point: PeriodProfilePoint) => number | null) =>
      Array.from({ length: 24 }, (_, hour) => {
        const row = rows.find((point) => point.hourOfDay === hour);
        return row ? read(row) : null;
      });
    return [
      {
        period,
        days: Math.max(...rows.map((row) => row.days)),
        speeds: byHour((row) => row.weightedAverageSpeedKmh),
        vehicles: byHour((row) => row.averageVehicleCount),
      },
    ];
  });
}

/** Hour with the lowest value inside an inclusive hour window. */
export function minimumHour(values: (number | null)[], fromHour = 0, toHour = 23) {
  let best: { hour: number; value: number } | null = null;
  for (let hour = fromHour; hour <= toHour; hour += 1) {
    const value = values[hour];
    if (value !== null && value !== undefined && (best === null || value < best.value)) {
      best = { hour, value };
    }
  }
  return best;
}

/** Hour with the highest value inside an inclusive hour window. */
export function maximumHour(values: (number | null)[], fromHour = 0, toHour = 23) {
  const inverted = values.map((value) => (value === null ? null : -value));
  const result = minimumHour(inverted, fromHour, toHour);
  return result ? { hour: result.hour, value: -result.value } : null;
}

/** Weekday hour whose daily speed varies the most between the 10th and 90th percentile. */
export function widestSpread(points: ReliabilityPoint[]) {
  return points.reduce<ReliabilityPoint | null>(
    (widest, point) =>
      widest === null || point.p90SpeedKmh - point.p10SpeedKmh > widest.p90SpeedKmh - widest.p10SpeedKmh ? point : widest,
    null,
  );
}

/** Mean of a numeric field, ignoring missing values. */
export function mean<T>(items: T[], read: (item: T) => number | null): number | null {
  const values = items.map(read).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export interface VolumeBreak {
  month: string;
  previous: number;
  current: number;
  changePct: number;
}

/**
 * Finds the largest month-to-month jump in vehicles per cell and hour. A jump this
 * large without a matching change in speed points to a change in how vehicles are
 * counted, so volume should not be compared across it.
 */
export function findVolumeBreak(months: MonthlyInsight[], thresholdPct = 25): VolumeBreak | null {
  let largest: VolumeBreak | null = null;
  for (let index = 1; index < months.length; index += 1) {
    const before = months[index - 1];
    const after = months[index];
    if (!before || !after || before.averageVehicleCount <= 0) {
      continue;
    }
    const changePct = (after.averageVehicleCount / before.averageVehicleCount - 1) * 100;
    if (Math.abs(changePct) >= thresholdPct && (largest === null || Math.abs(changePct) > Math.abs(largest.changePct))) {
      largest = { month: after.month, previous: before.averageVehicleCount, current: after.averageVehicleCount, changePct };
    }
  }
  return largest;
}

/** True when the break month lies after the start of one period and not after the end of the other. */
export function spansBreak(volumeBreak: VolumeBreak | null, earlierFrom: string, laterTo: string): boolean {
  return volumeBreak !== null && volumeBreak.month > earlierFrom && volumeBreak.month <= laterTo;
}
