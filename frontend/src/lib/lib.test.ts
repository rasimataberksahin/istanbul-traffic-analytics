import { describe, expect, it } from "vitest";
import {
  buildRange,
  lastMonthsStart,
  monthEnd,
  parseFilter,
  parseGeohash,
  previousYear,
  rangeDays,
  toSearchParams,
} from "@/lib/filters";
import { formatHour, formatPercent, formatSigned, formatSpeed } from "@/lib/format";
import { changeClass, congestionClass, heatClass, linePath, niceScale } from "@/lib/scale";

const range = buildRange("2023-01-01", "2025-01-31");

describe("buildRange", () => {
  it("starts the default view at the latest month", () => {
    expect(range.defaultFrom).toBe("2025-01-01");
  });
});

describe("parseFilter", () => {
  it("shows the latest month by default", () => {
    expect(parseFilter({}, range)).toEqual({ from: "2025-01-01", to: "2025-01-31", dayType: "all" });
  });

  it("keeps valid values", () => {
    const filter = parseFilter({ from: "2024-10-05", to: "2024-10-09", dayType: "weekend" }, range);
    expect(filter).toEqual({ from: "2024-10-05", to: "2024-10-09", dayType: "weekend" });
  });

  it("clamps dates to the loaded data", () => {
    const filter = parseFilter({ from: "2022-06-01", to: "2023-02-10" }, range);
    expect(filter).toMatchObject({ from: "2023-01-01", to: "2023-02-10" });
  });

  it("swaps a reversed range", () => {
    const filter = parseFilter({ from: "2024-10-20", to: "2024-10-10" }, range);
    expect(filter).toMatchObject({ from: "2024-10-10", to: "2024-10-20" });
  });

  it("shortens a range the API would reject", () => {
    const filter = parseFilter({ from: "2023-01-01", to: "2025-01-31" }, range);
    expect(filter).toMatchObject({ from: "2024-02-01", to: "2025-01-31" });
    expect(rangeDays(filter.from, filter.to)).toBe(366);
  });

  it.each(["2024-13-45", "2024-02-31", "drop table", ""])("ignores the invalid date %s", (value) => {
    expect(parseFilter({ from: value }, range).from).toBe("2025-01-01");
  });

  it("ignores unknown day types", () => {
    expect(parseFilter({ dayType: "someday" }, range).dayType).toBe("all");
  });

  it("reads the first value of a repeated parameter", () => {
    expect(parseFilter({ dayType: ["weekday", "weekend"] }, range).dayType).toBe("weekday");
  });
});

describe("toSearchParams", () => {
  it("leaves default values out of the URL", () => {
    const filter = { from: range.defaultFrom, to: range.lastDate, dayType: "all" as const };
    expect(toSearchParams(filter, range).toString()).toBe("");
  });

  it("keeps changed values and extra parameters", () => {
    const filter = { from: "2024-10-05", to: range.lastDate, dayType: "holiday" as const };
    expect(toSearchParams(filter, range, { cell: "sxk973", empty: null }).toString()).toBe(
      "from=2024-10-05&dayType=holiday&cell=sxk973",
    );
  });
});

describe("parseGeohash", () => {
  it("normalizes valid values", () => {
    expect(parseGeohash({ cell: "SXK973" })).toBe("sxk973");
  });

  it.each(["short", "sxk97a", "../../etc"])("rejects %s", (cell) => {
    expect(parseGeohash({ cell })).toBeNull();
  });
});

describe("month windows", () => {
  it("counts the latest month as part of the window", () => {
    expect(lastMonthsStart(3, range)).toBe("2024-11-01");
    expect(lastMonthsStart(12, range)).toBe("2024-02-01");
  });

  it("never starts before the loaded data", () => {
    expect(lastMonthsStart(60, range)).toBe("2023-01-01");
  });

  it("knows the length of February in a leap year", () => {
    expect(monthEnd("2024-02-10")).toBe("2024-02-29");
  });
});

describe("previousYear", () => {
  it("shifts both dates by one year", () => {
    const filter = { from: "2024-10-01", to: "2024-10-31", dayType: "weekday" as const };
    expect(previousYear(filter, range)).toEqual({ from: "2023-10-01", to: "2023-10-31", dayType: "weekday" });
  });

  it("returns null when the earlier year is not loaded", () => {
    expect(previousYear({ from: "2023-06-01", to: "2023-06-30", dayType: "all" }, range)).toBeNull();
  });
});

describe("niceScale", () => {
  it("produces round ticks around the data", () => {
    const scale = niceScale(43.9, 71.9);
    expect(scale.min).toBeLessThanOrEqual(43.9);
    expect(scale.max).toBeGreaterThanOrEqual(71.9);
    expect(scale.ticks.every((tick) => tick % 2.5 === 0)).toBe(true);
  });

  it("handles a flat series", () => {
    const scale = niceScale(50, 50);
    expect(scale.max).toBeGreaterThan(scale.min);
  });
});

describe("linePath", () => {
  it("starts a new segment after a gap", () => {
    const path = linePath([{ x: 0, y: 1 }, { x: 1, y: 2 }, null, { x: 3, y: 4 }]);
    expect(path).toBe("M0.00 1.00L1.00 2.00M3.00 4.00");
  });
});

describe("value classes", () => {
  it.each([
    [44.9, 1],
    [45, 2],
    [69.9, 6],
    [70, 7],
  ])("maps speed %d to heat class %d", (speed, expected) => {
    expect(heatClass(speed)).toBe(expected);
  });

  it.each([
    [-0.3, 1],
    [0, 3],
    [0.05, 4],
    [0.76, 7],
  ])("maps index %d to congestion class %d", (index, expected) => {
    expect(congestionClass(index)).toBe(expected);
  });

  it.each([
    [-8, 7],
    [0, 4],
    [2, 3],
    [9, 1],
  ])("maps a change of %d km/h to class %d", (change, expected) => {
    expect(changeClass(change)).toBe(expected);
  });
});

describe("formatting", () => {
  it("uses Turkish number formats", () => {
    expect(formatSpeed(54.31)).toBe("54,3 km/sa");
    expect(formatPercent(35.77)).toBe("%35,8");
    expect(formatHour(8)).toBe("08:00");
  });

  it("signs changes with a real minus", () => {
    expect(formatSigned(2.14)).toBe("+2,1");
    expect(formatSigned(-0.84)).toBe("−0,8");
    expect(formatSigned(0.01)).toBe("0,0");
  });

  it("describes missing speed", () => {
    expect(formatSpeed(null)).toBe("Veri yok");
  });
});
