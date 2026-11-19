import type { DayType } from "@/lib/types";

export interface DashboardFilter {
  from: string;
  to: string;
  dayType: DayType;
}

export interface DateRange {
  firstDate: string;
  lastDate: string;
  /** Start of the default view: the first day of the latest loaded month. */
  defaultFrom: string;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** The API accepts at most 366 days, which the dashboard enforces before asking. */
export const MAX_RANGE_DAYS = 366;

export const DAY_TYPE_OPTIONS: { value: DayType; label: string }[] = [
  { value: "all", label: "Tüm günler" },
  { value: "weekday", label: "Hafta içi" },
  { value: "weekend", label: "Hafta sonu" },
  { value: "holiday", label: "Resmî tatil" },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GEOHASH_PATTERN = /^[0-9bcdefghjkmnpqrstuvwxyz]{6}$/;
const DAY_MS = 86_400_000;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

function isRealDate(value: string | undefined): value is string {
  if (!value || !DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = toDate(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function clamp(value: string, range: Pick<DateRange, "firstDate" | "lastDate">): string {
  if (value < range.firstDate) {
    return range.firstDate;
  }
  return value > range.lastDate ? range.lastDate : value;
}

export function addDays(date: string, days: number): string {
  return toIso(new Date(toDate(date).getTime() + days * DAY_MS));
}

/** Number of calendar days in an inclusive range. */
export function rangeDays(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS) + 1;
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: string): string {
  const next = toDate(monthStart(date));
  next.setUTCMonth(next.getUTCMonth() + 1);
  return addDays(toIso(next), -1);
}

/** Builds the date range of the loaded data. The default view is the latest month. */
export function buildRange(firstDate: string, lastDate: string): DateRange {
  return { firstDate, lastDate, defaultFrom: clamp(monthStart(lastDate), { firstDate, lastDate }) };
}

/** Turns untrusted URL values into a filter that is always valid for the loaded data. */
export function parseFilter(params: RawSearchParams, range: DateRange): DashboardFilter {
  const rawFrom = single(params.from);
  const rawTo = single(params.to);
  const rawDayType = single(params.dayType);

  const first = clamp(isRealDate(rawFrom) ? rawFrom : range.defaultFrom, range);
  const second = clamp(isRealDate(rawTo) ? rawTo : range.lastDate, range);
  const dayType = DAY_TYPE_OPTIONS.find((option) => option.value === rawDayType)?.value ?? "all";

  const [from, to] = first <= second ? [first, second] : [second, first];
  // A range the API would reject keeps its end and is shortened from the start.
  const limitedFrom = rangeDays(from, to) > MAX_RANGE_DAYS ? addDays(to, -(MAX_RANGE_DAYS - 1)) : from;

  return { from: limitedFrom, to, dayType };
}

export function parseGeohash(params: RawSearchParams): string | null {
  const value = single(params.cell)?.toLowerCase();
  return value && GEOHASH_PATTERN.test(value) ? value : null;
}

/** Builds a short URL query by leaving out values that match the defaults. */
export function toSearchParams(
  filter: DashboardFilter,
  range: DateRange,
  extra: Record<string, string | null> = {},
): URLSearchParams {
  const query = new URLSearchParams();
  if (filter.from !== range.defaultFrom) {
    query.set("from", filter.from);
  }
  if (filter.to !== range.lastDate) {
    query.set("to", filter.to);
  }
  if (filter.dayType !== "all") {
    query.set("dayType", filter.dayType);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) {
      query.set(key, value);
    }
  }
  return query;
}

/** First day of a window of whole months that ends with the latest loaded month. */
export function lastMonthsStart(months: number, range: DateRange): string {
  const start = toDate(range.defaultFrom);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  return clamp(toIso(start), range);
}

/** The same dates one year earlier, or null when that period is not loaded. */
export function previousYear(filter: DashboardFilter, range: DateRange): DashboardFilter | null {
  const shift = (value: string) => {
    const date = toDate(value);
    date.setUTCFullYear(date.getUTCFullYear() - 1);
    return toIso(date);
  };
  const from = shift(filter.from);
  const to = shift(filter.to);
  return from >= range.firstDate ? { ...filter, from, to } : null;
}
