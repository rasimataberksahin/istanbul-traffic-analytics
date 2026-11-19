import { intlLocale, type Locale } from "@/lib/i18n/locale";

const asUtc = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`);

/** Number, date and unit formatters for one language. */
export function makeFormat(locale: Locale) {
  const tag = intlLocale(locale);
  const en = locale === "en";
  const decimal = new Intl.NumberFormat(tag, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const twoDecimals = new Intl.NumberFormat(tag, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const integer = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 });
  const shortDate = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC" });
  const longDate = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const shortMonth = new Intl.DateTimeFormat(tag, { month: "short", year: "2-digit", timeZone: "UTC" });
  const monthOnly = new Intl.DateTimeFormat(tag, { month: "short", timeZone: "UTC" });
  const monthName = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" });
  const weekday = new Intl.DateTimeFormat(tag, { weekday: "long", timeZone: "UTC" });
  const dateTime = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" });
  const noData = en ? "No data" : "Veri yok";
  const unit = en ? "km/h" : "km/sa";

  /** Signed value with a real minus sign, for changes such as "+2,1" or "−0,8". */
  function formatSigned(value: number, digits = 1): string {
    const text = new Intl.NumberFormat(tag, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.abs(value));
    if (Number(Math.abs(value).toFixed(digits)) === 0) {
      return text;
    }
    return `${value > 0 ? "+" : "−"}${text}`;
  }

  return {
    locale,
    noData,
    speedUnit: unit,
    formatSpeed: (value: number | null | undefined) =>
      value === null || value === undefined ? noData : `${decimal.format(value)} ${unit}`,
    formatDecimal: (value: number) => decimal.format(value),
    formatIndex: (value: number) => twoDecimals.format(value),
    formatInteger: (value: number) => integer.format(value),
    formatCompact: (value: number) => compact.format(value),
    formatPercent: (value: number) => (en ? `${decimal.format(value)}%` : `%${decimal.format(value)}`),
    formatHour: (hour: number) => `${String(hour).padStart(2, "0")}:00`,
    formatShortDate: (date: string) => shortDate.format(asUtc(date)),
    formatLongDate: (date: string) => longDate.format(asUtc(date)),
    formatMonth: (date: string) => monthName.format(asUtc(date)),
    formatWeekday: (date: string) => weekday.format(asUtc(date)),
    formatDateTime: (value: string) => dateTime.format(new Date(value)),
    /** "Eki 24": compact label for monthly axes. */
    formatShortMonth: (date: string) => shortMonth.format(asUtc(date)).replace(/\s+/g, " "),
    /** Month name for an index from 0 (January) to 11. */
    formatMonthIndex: (index: number) => monthOnly.format(new Date(Date.UTC(2024, index, 1))),
    formatSigned,
    /** Signed percentage: "+%3,2" in Turkish order, "+3.2%" in English. */
    formatSignedPercent(value: number, digits = 1): string {
      const signed = formatSigned(value, digits);
      if (en) {
        return `${signed}%`;
      }
      // A word joiner keeps the sign and the percent sign on the same line.
      return /^[+−]/.test(signed) ? `${signed[0]}⁠%${signed.slice(1)}` : `%${signed}`;
    },
    /** Large counts in words, such as "1,8 milyon" or "1.8 million". */
    formatLargeCount(value: number): string {
      if (Math.abs(value) >= 1_000_000) {
        return `${decimal.format(value / 1_000_000)} ${en ? "million" : "milyon"}`;
      }
      if (Math.abs(value) >= 10_000) {
        return `${integer.format(value / 1_000)} ${en ? "thousand" : "bin"}`;
      }
      return integer.format(value);
    },
  };
}

export type Format = ReturnType<typeof makeFormat>;

// Turkish formatters, the default language, for code that does not depend on the reader's choice.
const tr = makeFormat("tr");
export const {
  formatSpeed,
  formatDecimal,
  formatIndex,
  formatInteger,
  formatCompact,
  formatPercent,
  formatHour,
  formatShortDate,
  formatLongDate,
  formatMonth,
  formatDateTime,
  formatShortMonth,
  formatMonthIndex,
  formatSigned,
  formatSignedPercent,
  formatLargeCount,
} = tr;
