import { describe, expect, it } from "vitest";
import { lastSpokenWord, spokenTail, suffix } from "@/lib/i18n/turkish";

describe("lastSpokenWord", () => {
  it.each([
    [0, "sıfır"],
    [6, "altı"],
    [16, "altı"],
    [40, "kırk"],
    [100, "yüz"],
    [2000, "bin"],
    [2023, "üç"],
    [3_000_000, "milyon"],
  ])("%i ends on %s", (value, word) => {
    expect(lastSpokenWord(value)).toBe(word);
  });
});

describe("spokenTail", () => {
  it("reads a full hour as the hour and other times by the minutes", () => {
    expect(spokenTail("18:00")).toBe("sekiz");
    expect(spokenTail("19:30")).toBe("otuz");
  });

  it("reads decimals by the part after the comma", () => {
    expect(spokenTail("12,5")).toBe("beş");
    expect(spokenTail("%4,0")).toBe("sıfır");
  });

  it("ignores thousands separators", () => {
    expect(spokenTail("1.200")).toBe("yüz");
  });
});

describe("suffix", () => {
  it.each([
    ["%16", "possessiveLocative", "%16'sında"],
    ["%40", "possessiveLocative", "%40'ında"],
    ["%7", "possessiveLocative", "%7'sinde"],
    ["%5", "possessiveLocative", "%5'inde"],
    ["%100", "possessiveLocative", "%100'ünde"],
    ["%60", "possessiveDative", "%60'ına"],
    ["%32", "possessiveDative", "%32'sine"],
    ["%9", "possessive", "%9'u"],
    ["%3", "possessive", "%3'ü"],
    ["18:00", "locative", "18:00'de"],
    ["19:00", "locative", "19:00'da"],
    ["17:00", "locative", "17:00'de"],
    ["16:00", "locative", "16:00'da"],
    ["13:00", "locative", "13:00'te"],
    ["2024", "locative", "2024'te"],
    ["2026", "locative", "2026'da"],
    ["2020", "locative", "2020'de"],
    ["2023", "dative", "2023'e"],
    ["2026", "dative", "2026'ya"],
    ["12,5", "ablative", "12,5'ten"],
    ["10,2", "ablative", "10,2'den"],
    ["13,4", "dative", "13,4'e"],
    ["9,0", "dative", "9,0'a"],
  ] as const)("%s + %s = %s", (text, kind, expected) => {
    expect(suffix(text, kind)).toBe(expected);
  });
});
