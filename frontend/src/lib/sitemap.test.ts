import { describe, expect, it } from "vitest";
import { PAGES, rankMatches, SECTIONS } from "@/lib/sitemap";

const entries = [
  { title: "Hava durumu", extra: "Analiz raporu yağmur kar" },
  { title: "Yağmurda kaza artıyor mu?", extra: "Olaylar" },
  { title: "Harita", extra: "semt ilçe" },
];

describe("rankMatches", () => {
  it("keeps everything for an empty query", () => {
    expect(rankMatches("  ", entries)).toHaveLength(3);
  });

  it("ignores accents and Turkish case", () => {
    expect(rankMatches("YAGMUR", entries).map((entry) => entry.title)).toEqual(["Yağmurda kaza artıyor mu?", "Hava durumu"]);
  });

  it("puts title prefixes first and needs every word", () => {
    expect(rankMatches("ha", entries)[0]?.title).toBe("Hava durumu");
    expect(rankMatches("hava kar", entries).map((entry) => entry.title)).toEqual(["Hava durumu"]);
    expect(rankMatches("hava parade", entries)).toHaveLength(0);
  });
});

describe("sitemap", () => {
  it("links every section to a page", () => {
    const paths = new Set(PAGES.map((page) => page.href));
    for (const section of SECTIONS) {
      expect(paths.has(section.href.split("#")[0] ?? "")).toBe(true);
    }
  });
});
