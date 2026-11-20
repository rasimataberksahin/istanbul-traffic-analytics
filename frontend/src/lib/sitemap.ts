import { searchKey } from "@/lib/places";

/** Everything the command palette can jump to, in both languages. */
export interface Destination {
  href: string;
  tr: string;
  en: string;
  /** The page a section belongs to, for the palette's second line. */
  page?: { tr: string; en: string };
  /** Extra words that should find this entry. */
  keywords?: string;
}

const OVERVIEW = { tr: "Genel bakış", en: "Overview" };
const REPORT = { tr: "Analiz raporu", en: "Report" };
const MAP = { tr: "Harita", en: "Map" };
const INCIDENTS = { tr: "Olaylar", en: "Incidents" };
const PIPELINE = { tr: "Veri hattı", en: "Pipeline" };
const GUIDE = { tr: "Kılavuz", en: "Guide" };

export const PAGES: Destination[] = [
  { href: "/", ...OVERVIEW, keywords: "ana sayfa home şimdi now saat clock" },
  { href: "/analiz", ...REPORT, keywords: "rapor analysis trend" },
  { href: "/harita", ...MAP, keywords: "map tıkanıklık congestion semt ilçe district" },
  { href: "/olaylar", ...INCIDENTS, keywords: "kaza accident arıza incident duyuru" },
  { href: "/veri-hatti", ...PIPELINE, keywords: "etl pipeline kalite quality yükleme" },
  { href: "/kilavuz", ...GUIDE, keywords: "yardım help nasıl how sözlük glossary" },
];

const section = (page: Destination, path: string, id: string, tr: string, en: string, keywords?: string): Destination => ({
  href: `${path}#${id}`,
  tr,
  en,
  page: { tr: page.tr, en: page.en },
  keywords,
});

const report = PAGES[1] as Destination;
const incidents = PAGES[3] as Destination;
const guide = PAGES[5] as Destination;

export const SECTIONS: Destination[] = [
  section(report, "/analiz", "ozet", "Özet", "Summary", "bulgular findings"),
  section(report, "/analiz", "aylik-trend", "Aylık hız", "Monthly speed"),
  section(report, "/analiz", "yillik", "Yıllık karşılaştırma", "Year on year", "2024 akşam evening"),
  section(report, "/analiz", "tikaniklik", "Tıkanıklık", "Congestion", "endeks index"),
  section(report, "/analiz", "mevsimsellik", "Ay ve saat", "Month and hour", "mevsim season ısı heatmap"),
  section(report, "/analiz", "haftanin-gunleri", "Haftanın günleri", "Days of the week", "pazartesi cuma"),
  section(report, "/analiz", "takvim", "Takvim", "Calendar"),
  section(report, "/analiz", "donemler", "Okul, tatil, Ramazan", "School, holidays, Ramadan", "okul school ramazan"),
  section(report, "/analiz", "tatiller", "Resmî tatiller", "Public holidays", "bayram"),
  section(report, "/analiz", "hava", "Hava durumu", "Weather", "yağmur rain kar snow"),
  section(report, "/analiz", "guvenilirlik", "Öngörülebilirlik", "Predictability", "güvenilirlik reliability"),
  section(report, "/analiz", "konum-degisimi", "Bölgesel değişim", "Change by area"),
  section(report, "/analiz", "veri-kapsami", "Veri kapsamı ve yöntem", "Coverage and method", "yöntem method"),
  section(incidents, "/olaylar", "harita", "Olay haritası", "Incident map"),
  section(incidents, "/olaylar", "zaman", "Yıllar ve saatler", "Years and hours"),
  section(incidents, "/olaylar", "yollar", "En çok olay yaşanan yollar", "Roads with the most incidents", "d100 tem köprü bridge"),
  section(incidents, "/olaylar", "sureler", "Olaylar ne kadar sürüyor?", "How long do incidents last?", "süre duration"),
  section(incidents, "/olaylar", "hava-kaza", "Yağmurda kaza artıyor mu?", "Are there more accidents in the rain?", "yağmur rain"),
  section(incidents, "/olaylar", "trafik-etkisi", "Bir kaza trafiği ne kadar yavaşlatıyor?", "How much does an accident slow traffic?", "etki impact"),
  section(guide, "/kilavuz", "baslarken", "Başlarken", "Getting started"),
  section(guide, "/kilavuz", "sayfalar", "Sayfalar", "Pages"),
  section(guide, "/kilavuz", "kontroller", "Kontroller", "Controls", "kısayol shortcut"),
  section(guide, "/kilavuz", "kavramlar", "Kavramlar", "Glossary", "sözlük"),
  section(guide, "/kilavuz", "veri", "Veri ve sınırlar", "Data and limits"),
];

export interface Searchable {
  title: string;
  /** Other words that should find the entry (page name, keywords). */
  extra?: string;
}

/**
 * Entries whose text holds every word of the query, accent- and case-blind, best first: a title
 * that starts with the query, then a title that holds it, then a match in the other words. An
 * empty query keeps every entry in its order.
 */
export function rankMatches<T extends Searchable>(query: string, entries: T[]): T[] {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return entries;
  }
  const whole = words.join(" ");
  const scored: { entry: T; score: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const title = searchKey(entry.title);
    const haystack = `${title} ${searchKey(entry.extra ?? "")}`;
    if (!words.every((word) => haystack.includes(word))) {
      return;
    }
    const score = title.startsWith(whole) ? 0 : title.includes(whole) ? 1 : words.every((word) => title.includes(word)) ? 2 : 3;
    scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((item) => item.entry);
}
