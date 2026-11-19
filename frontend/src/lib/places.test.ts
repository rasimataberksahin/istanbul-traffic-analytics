import { describe, expect, it } from "vitest";
import { placeLabel, searchKey, summarizeDistricts } from "./places";

describe("placeLabel", () => {
  it("uses the neighbourhood with its district", () => {
    expect(placeLabel({ geohash: "sxk9ab", neighborhood: "Caferağa", district: "Kadıköy" })).toEqual({
      title: "Caferağa",
      subtitle: "Kadıköy",
      full: "Caferağa, Kadıköy",
    });
  });

  it("falls back to the district, then to the geohash", () => {
    expect(placeLabel({ geohash: "sxk9ab", neighborhood: null, district: "Beşiktaş" }).full).toBe("Beşiktaş");
    expect(placeLabel({ geohash: "sxk9ab" }).full).toBe("Hücre sxk9ab");
    expect(placeLabel({ geohash: "sxk9ab", neighborhood: " ", district: "" }).subtitle).toBe("Semt adı yok");
  });
});

describe("searchKey", () => {
  it("matches Turkish letters typed without accents", () => {
    expect(searchKey("Kadıköy")).toBe("kadikoy");
    expect(searchKey("İSTİNYE")).toBe("istinye");
    expect(searchKey("Şişli")).toBe("sisli");
    expect(searchKey("Üsküdar")).toBe(searchKey("uskudar"));
  });
});

describe("summarizeDistricts", () => {
  const point = (geohash: string, district: string | null, vehicles: number, free: number, peak: number) => ({
    geohash,
    neighborhood: `${geohash}-mahalle`,
    district,
    averagePeakVehicleCount: vehicles,
    freeFlowSpeedKmh: free,
    peakSpeedKmh: peak,
  });

  it("weights speeds by evening vehicles and ranks by congestion", () => {
    const summaries = summarizeDistricts(
      [
        point("a", "Kadıköy", 100, 60, 30),
        point("b", "Kadıköy", 300, 60, 50),
        point("c", "Sarıyer", 100, 80, 70),
        point("d", null, 100, 80, 10),
      ],
      1,
    );

    expect(summaries.map((summary) => summary.district)).toEqual(["Kadıköy", "Sarıyer"]);
    const kadikoy = summaries[0]!;
    expect(kadikoy.cells).toBe(2);
    expect(kadikoy.peakSpeedKmh).toBeCloseTo((30 * 100 + 50 * 300) / 400, 6);
    expect(kadikoy.congestionIndex).toBeCloseTo(1 - 18000 / 24000, 6);
    expect(kadikoy.slowest).toEqual({ geohash: "a", neighborhood: "a-mahalle", peakSpeedKmh: 30 });
  });

  it("drops districts with too few cells", () => {
    expect(summarizeDistricts([point("a", "Adalar", 10, 50, 40)], 2)).toEqual([]);
  });
});

describe("placeLabel in English", () => {
  it("translates the fallbacks", () => {
    expect(placeLabel({ geohash: "sxk9ab", district: "Beşiktaş" }, "en").subtitle).toBe("District");
    expect(placeLabel({ geohash: "sxk9ab" }, "en").full).toBe("Cell sxk9ab");
  });
});
