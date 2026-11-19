import { describe, expect, it } from "vitest";
import { CELL_LAT, CELL_LON, cellBounds, cellFeatures, cellRing, extrusionHeight, quantileThresholds, type MapCell } from "./map";

const cell = (id: string, longitude: number, latitude: number, levels: number[]): MapCell => ({
  id,
  longitude,
  latitude,
  levels,
  lines: [],
});

describe("extrusionHeight", () => {
  it("grows with the level for ascending scales", () => {
    expect(extrusionHeight(1, "ascending")).toBe(40);
    expect(extrusionHeight(7, "ascending")).toBe(40 + 6 * 230);
  });

  it("grows as the level falls for descending scales", () => {
    expect(extrusionHeight(1, "descending")).toBe(40 + 6 * 230);
    expect(extrusionHeight(7, "descending")).toBe(40);
  });

  it("measures distance from the neutral middle for diverging scales", () => {
    expect(extrusionHeight(4, "magnitude")).toBe(40);
    expect(extrusionHeight(1, "magnitude")).toBe(extrusionHeight(7, "magnitude"));
  });

  it("clamps levels outside 1-7", () => {
    expect(extrusionHeight(0, "ascending")).toBe(extrusionHeight(1, "ascending"));
    expect(extrusionHeight(12, "ascending")).toBe(extrusionHeight(7, "ascending"));
  });
});

describe("cellRing", () => {
  it("returns a closed rectangle centred on the cell", () => {
    const ring = cellRing(29, 41, 1);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    const [west, south] = ring[0]!;
    const [east, north] = ring[2]!;
    expect(east - west).toBeCloseTo(CELL_LON, 6);
    expect(north - south).toBeCloseTo(CELL_LAT, 6);
    expect((east + west) / 2).toBeCloseTo(29, 6);
    expect((north + south) / 2).toBeCloseTo(41, 6);
  });

  it("shrinks the cell by the fill ratio", () => {
    const ring = cellRing(29, 41, 0.5);
    expect(ring[1]![0] - ring[0]![0]).toBeCloseTo(CELL_LON / 2, 6);
  });
});

describe("cellFeatures", () => {
  it("uses the selected mode's level and numeric ids", () => {
    const collection = cellFeatures([cell("a", 29, 41, [2, 6]), cell("b", 29.1, 41.1, [5, 1])], 1, "descending");
    expect(collection.features.map((feature) => feature.id)).toEqual([0, 1]);
    expect(collection.features.map((feature) => feature.properties.level)).toEqual([6, 1]);
    expect(collection.features[1]!.properties.height).toBe(extrusionHeight(1, "descending"));
    expect(collection.features[0]!.properties.id).toBe("a");
  });

  it("falls back to the neutral level when a mode has no value", () => {
    const collection = cellFeatures([cell("a", 29, 41, [3])], 2, "ascending");
    expect(collection.features[0]!.properties.level).toBe(4);
  });
});

describe("cellBounds", () => {
  it("covers the outer edges of every cell", () => {
    expect(cellBounds([cell("a", 29, 41, [1]), cell("b", 29.2, 41.1, [1])])).toEqual([
      29 - CELL_LON / 2,
      41 - CELL_LAT / 2,
      29.2 + CELL_LON / 2,
      41.1 + CELL_LAT / 2,
    ]);
  });

  it("returns null without cells", () => {
    expect(cellBounds([])).toBeNull();
  });
});

describe("quantileThresholds", () => {
  it("splits values into equal-count classes", () => {
    const values = Array.from({ length: 71 }, (_, index) => index);
    expect(quantileThresholds(values)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it("ignores non-finite values and handles empty input", () => {
    expect(quantileThresholds([Number.NaN])).toEqual([]);
    expect(quantileThresholds([5, Number.POSITIVE_INFINITY, 5])).toEqual([5, 5, 5, 5, 5, 5]);
  });
});
