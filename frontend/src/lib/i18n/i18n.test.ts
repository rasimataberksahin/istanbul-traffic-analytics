import { describe, expect, it } from "vitest";
import { makeFormat } from "@/lib/format";
import { isLocale, isTheme, pick, translator } from "@/lib/i18n/locale";
import { dayName, term } from "@/lib/i18n/terms";

describe("locale helpers", () => {
  it("picks the text of the active language", () => {
    expect(pick("tr", "Harita", "Map")).toBe("Harita");
    expect(translator("en")("Harita", "Map")).toBe("Map");
  });

  it("accepts only known values from cookies", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("blue")).toBe(false);
  });
});

describe("English formatting", () => {
  const en = makeFormat("en");
  const tr = makeFormat("tr");

  it("uses English separators and units", () => {
    expect(en.formatSpeed(54.31)).toBe("54.3 km/h");
    expect(tr.formatSpeed(54.31)).toBe("54,3 km/sa");
    expect(en.formatPercent(51.8)).toBe("51.8%");
    expect(en.formatSignedPercent(-3.24)).toBe("−3.2%");
    expect(en.formatLargeCount(1_769_643)).toBe("1.8 million");
    expect(en.formatSpeed(null)).toBe("No data");
  });

  it("writes English month names", () => {
    expect(en.formatMonth("2025-01-01")).toBe("January 2025");
    expect(en.formatLongDate("2024-10-29")).toBe("29 October 2024");
  });
});

describe("API terms", () => {
  it("translates day names only for English readers", () => {
    expect(dayName("Çarşamba", "en")).toBe("Wednesday");
    expect(dayName("Paz", "en")).toBe("Sun");
    expect(dayName("Çarşamba", "tr")).toBe("Çarşamba");
  });

  it("translates holidays and periods, longest phrase first", () => {
    expect(term("Ramazan Bayramı ve 23 Nisan", "en")).toBe("Eid al-Fitr and 23 April");
    expect(term("Yaz tatili 2024, Kurban Bayramı", "en")).toBe("Summer break 2024, Eid al-Adha");
    expect(term("Ramazan 2024", "en")).toBe("Ramadan 2024");
    expect(term("Ara tatil Kasım 2023", "tr")).toBe("Ara tatil Kasım 2023");
  });
});
