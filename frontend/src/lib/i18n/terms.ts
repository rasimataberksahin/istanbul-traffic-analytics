import type { Locale } from "@/lib/i18n/locale";

const DAYS: Record<string, string> = {
  Pazartesi: "Monday",
  Salı: "Tuesday",
  Çarşamba: "Wednesday",
  Perşembe: "Thursday",
  Cuma: "Friday",
  Cumartesi: "Saturday",
  Pazar: "Sunday",
};

const SHORT_DAYS: Record<string, string> = {
  Pzt: "Mon",
  Sal: "Tue",
  Çar: "Wed",
  Per: "Thu",
  Cum: "Fri",
  Cmt: "Sat",
  Paz: "Sun",
};

/**
 * Phrases the API sends in Turkish (holidays, school and Ramadan periods), longest first so
 * "Ramazan Bayramı" wins over "Ramazan".
 */
const PHRASES: [string, string][] = [
  ["Ramazan Bayramı", "Eid al-Fitr"],
  ["Kurban Bayramı", "Eid al-Adha"],
  ["Yarıyıl tatili", "Semester break"],
  ["Yaz tatili", "Summer break"],
  ["Ara tatil", "Mid-term break"],
  ["Okul dönemi", "School term"],
  ["Yılbaşı", "New Year's Day"],
  ["Ramazan", "Ramadan"],
  ["Ocak", "January"],
  ["Şubat", "February"],
  ["Mart", "March"],
  ["Nisan", "April"],
  ["Mayıs", "May"],
  ["Haziran", "June"],
  ["Temmuz", "July"],
  ["Ağustos", "August"],
  ["Eylül", "September"],
  ["Ekim", "October"],
  ["Kasım", "November"],
  ["Aralık", "December"],
  [" ve ", " and "],
];

/** A day name from the API ("Pazartesi" or "Pzt") in the reader's language. */
export function dayName(name: string, locale: Locale): string {
  if (locale === "tr") {
    return name;
  }
  return DAYS[name] ?? SHORT_DAYS[name] ?? name;
}

/** A holiday or period name from the API in the reader's language. */
export function term(text: string, locale: Locale): string {
  if (locale === "tr" || !text) {
    return text;
  }
  let result = text;
  for (const [tr, en] of PHRASES) {
    result = result.split(tr).join(en);
  }
  return result;
}
