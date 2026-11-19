import type { Locale } from "@/lib/i18n/locale";
import type { AccidentSeverity, IncidentCategory, IncidentTrafficImpact, IncidentWeekHour } from "@/lib/types";

const CATEGORY_LABELS: Record<IncidentCategory, [string, string]> = {
  accident: ["Kaza", "Accident"],
  breakdown: ["Araç arızası", "Breakdown"],
  vehicle_fire: ["Araç yangını", "Vehicle fire"],
  roadworks: ["Yol çalışması", "Road works"],
  closure: ["Yol kapanması", "Road closure"],
  congestion: ["Yoğun trafik", "Heavy traffic"],
  event: ["Etkinlik", "Event"],
  weather: ["Hava koşulu", "Weather"],
  other: ["Diğer", "Other"],
};

const SEVERITY_LABELS: Record<AccidentSeverity, [string, string]> = {
  damage: ["Hasarlı", "Damage only"],
  injury: ["Yaralanmalı", "Injury"],
  chain: ["Zincirleme", "Pile-up"],
  fatal: ["Can kaybı", "Fatal"],
  unknown: ["Belirsiz", "Unknown"],
};

export const categoryLabel = (category: IncidentCategory, locale: Locale) => CATEGORY_LABELS[category]?.[locale === "en" ? 1 : 0] ?? category;

export const severityLabel = (severity: AccidentSeverity, locale: Locale) => SEVERITY_LABELS[severity]?.[locale === "en" ? 1 : 0] ?? severity;

/** Categories offered as filters, most common first. */
export const FILTER_CATEGORIES: IncidentCategory[] = ["accident", "breakdown", "roadworks", "closure", "congestion", "vehicle_fire"];

export const isIncidentCategory = (value: unknown): value is IncidentCategory =>
  typeof value === "string" && value in CATEGORY_LABELS;

/** Groups of the recovery curve, in the order the chart draws them. */
export const RECOVERY_GROUPS = ["breakdown", "accident_damage", "accident_injury", "accident_fatal"] as const;

export function recoveryLabel(group: string, locale: Locale): string {
  if (group.startsWith("accident_")) {
    const severity = group.slice("accident_".length) as AccidentSeverity;
    return locale === "en" ? `Accident, ${severityLabel(severity, locale).toLowerCase()}` : `Kaza, ${severityLabel(severity, locale).toLocaleLowerCase("tr-TR")}`;
  }
  return categoryLabel(group as IncidentCategory, locale);
}

/** Speed change at each offset from one hour before to three hours after, per group. */
export function recoverySeries(impact: IncidentTrafficImpact, group: string): (number | null)[] {
  return [-1, 0, 1, 2, 3].map(
    (offset) => impact.recovery.find((point) => point.group === group && point.offsetHours === offset)?.speedChangeKmh ?? null,
  );
}

/** Hours until a group is back within half a km/h of its usual speed, or null if it never is in the window. */
export function recoveryHours(series: (number | null)[], tolerance = 0.5): number | null {
  for (let index = 1; index < series.length; index += 1) {
    const value = series[index];
    if (value !== null && value !== undefined && Math.abs(value) <= tolerance) {
      return index - 1;
    }
  }
  return null;
}

/** Thresholds that split positive counts into seven classes of equal size, ignoring empty cells. */
export function countThresholds(values: number[]): number[] {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return [1, 2, 3, 4, 5, 6];
  }
  const thresholds: number[] = [];
  for (let step = 1; step < 7; step += 1) {
    const value = sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * step) / 7))] ?? 1;
    thresholds.push(Math.max(value, (thresholds.at(-1) ?? 0) + 1));
  }
  return thresholds;
}

/** The busiest day-and-hour of a week matrix. */
export function busiestSlot(cells: IncidentWeekHour[]): IncidentWeekHour | null {
  return cells.reduce<IncidentWeekHour | null>((best, cell) => (best === null || cell.incidents > best.incidents ? cell : best), null);
}

export interface PeriodOption {
  key: string;
  from?: string;
  to?: string;
  labelTr: string;
  labelEn: string;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function shiftDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

/** Quick periods relative to the latest incident, then whole calendar years, newest first. */
export function periodOptions(firstDate: string, lastDate: string): PeriodOption[] {
  const options: PeriodOption[] = [
    { key: "30d", from: shiftDays(lastDate, -29), to: lastDate, labelTr: "Son 30 gün", labelEn: "Last 30 days" },
    { key: "12m", labelTr: "Son 12 ay", labelEn: "Last 12 months" },
  ];
  for (let year = Number(lastDate.slice(0, 4)); year >= Number(firstDate.slice(0, 4)); year -= 1) {
    const from = `${year}-01-01` < firstDate ? firstDate : `${year}-01-01`;
    const to = `${year}-12-31` > lastDate ? lastDate : `${year}-12-31`;
    options.push({ key: String(year), from, to, labelTr: String(year), labelEn: String(year) });
  }
  options.push({ key: "all", from: firstDate, to: lastDate, labelTr: "Tüm dönem", labelEn: "All years" });
  return options;
}

/** Percent change against last year, or null when there is nothing to compare with. */
export function changePct(current: number, previous: number | null | undefined): number | null {
  return previous ? ((current - previous) / previous) * 100 : null;
}
