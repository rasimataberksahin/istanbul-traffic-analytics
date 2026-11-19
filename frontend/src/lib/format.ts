const LOCALE = "tr-TR";

const decimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortMonth = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "2-digit", timeZone: "UTC" });
const monthOnly = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" });

const asUtc = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`);

export const formatSpeed = (value: number | null | undefined) =>
  value === null || value === undefined ? "Veri yok" : `${decimal.format(value)} km/sa`;

export const formatDecimal = (value: number) => decimal.format(value);

export const formatIndex = (value: number) => twoDecimals.format(value);

export const formatInteger = (value: number) => integer.format(value);

export const formatCompact = (value: number) => compact.format(value);

export const formatPercent = (value: number) => `%${decimal.format(value)}`;

export const formatHour = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export const formatShortDate = (date: string) => shortDate.format(asUtc(date));

export const formatLongDate = (date: string) => longDate.format(asUtc(date));

export const formatMonth = (date: string) => monthName.format(asUtc(date));

export const formatDateTime = (value: string) => dateTime.format(new Date(value));

/** "Eki 24": compact label for monthly axes. */
export const formatShortMonth = (date: string) => shortMonth.format(asUtc(date)).replace(/\s+/g, " ");

/** Month name for an index from 0 (January) to 11. */
export const formatMonthIndex = (index: number) => monthOnly.format(new Date(Date.UTC(2024, index, 1)));

/** Signed value with a real minus sign, for changes such as "+2,1" or "−0,8". */
export function formatSigned(value: number, digits = 1): string {
  const text = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(
    Math.abs(value),
  );
  if (Number(Math.abs(value).toFixed(digits)) === 0) {
    return text;
  }
  return `${value > 0 ? "+" : "−"}${text}`;
}

/** Signed percentage in Turkish order, such as "+%3,2" or "−%1,0". */
export function formatSignedPercent(value: number, digits = 1): string {
  const signed = formatSigned(value, digits);
  // A word joiner keeps the sign and the percent sign on the same line.
  return /^[+−]/.test(signed) ? `${signed[0]}⁠%${signed.slice(1)}` : `%${signed}`;
}
