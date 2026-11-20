import type { Locale } from "@/lib/i18n/locale";

export type CongestionLevel = "free" | "moderate" | "heavy" | "severe";

/** How far a speed sits below the day's free-flow speed, in four plain steps. */
export function congestionLevel(speed: number, freeFlow: number): CongestionLevel {
  const drop = freeFlow > 0 ? 1 - speed / freeFlow : 0;
  if (drop < 0.12) return "free";
  if (drop < 0.25) return "moderate";
  if (drop < 0.4) return "heavy";
  return "severe";
}

export interface IstanbulClock {
  /** 0-23 in Istanbul. */
  hour: number;
  /** ISO weekday in Istanbul, 1 = Monday. */
  isoDay: number;
  time: string;
  date: string;
  weekdayName: string;
}

const ISO_DAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** The wall clock in Istanbul (UTC+3 all year), whatever the reader's own time zone is. */
export function istanbulClock(moment: Date, locale: Locale): IstanbulClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(moment);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const tag = locale === "en" ? "en-GB" : "tr-TR";
  return {
    hour: Number(part("hour")) % 24,
    isoDay: ISO_DAYS[part("weekday")] ?? 1,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
    date: new Intl.DateTimeFormat(tag, { timeZone: "Europe/Istanbul", day: "numeric", month: "long" }).format(moment),
    weekdayName: new Intl.DateTimeFormat(tag, { timeZone: "Europe/Istanbul", weekday: "long" }).format(moment),
  };
}

/** Incident counts by ISO day and hour turned into a per-week rate, Monday first. */
export function incidentsPerWeek(cells: { isoDayOfWeek: number; hourOfDay: number; incidents: number }[], days: number): number[][] {
  const weeks = Math.max(days / 7, 1);
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const cell of cells) {
    const row = grid[cell.isoDayOfWeek - 1];
    if (row && cell.hourOfDay >= 0 && cell.hourOfDay < 24) {
      row[cell.hourOfDay] = cell.incidents / weeks;
    }
  }
  return grid;
}
