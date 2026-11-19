import { describe, expect, it } from "vitest";
import {
  busiestSlot,
  categoryLabel,
  changePct,
  countThresholds,
  isIncidentCategory,
  periodOptions,
  recoveryHours,
  recoveryLabel,
  recoverySeries,
} from "./incidents";
import type { IncidentTrafficImpact } from "./types";

describe("labels", () => {
  it("names categories and recovery groups in both languages", () => {
    expect(categoryLabel("breakdown", "tr")).toBe("Araç arızası");
    expect(categoryLabel("breakdown", "en")).toBe("Breakdown");
    expect(recoveryLabel("accident_fatal", "tr")).toBe("Kaza, can kaybı");
    expect(recoveryLabel("accident_injury", "en")).toBe("Accident, injury");
    expect(isIncidentCategory("roadworks")).toBe(true);
    expect(isIncidentCategory("parade")).toBe(false);
  });
});

describe("recovery", () => {
  const impact = {
    recovery: [
      { group: "accident_damage", offsetHours: -1, incidents: 9, speedChangeKmh: -2, speedChangePct: -4 },
      { group: "accident_damage", offsetHours: 0, incidents: 9, speedChangeKmh: -5.7, speedChangePct: -10 },
      { group: "accident_damage", offsetHours: 1, incidents: 9, speedChangeKmh: -3.3, speedChangePct: -6 },
      { group: "accident_damage", offsetHours: 2, incidents: 9, speedChangeKmh: -0.4, speedChangePct: -1 },
    ],
  } as IncidentTrafficImpact;

  it("orders the curve from one hour before to three hours after", () => {
    expect(recoverySeries(impact, "accident_damage")).toEqual([-2, -5.7, -3.3, -0.4, null]);
  });

  it("finds the first hour back near the usual speed", () => {
    expect(recoveryHours([-2, -5.7, -3.3, -0.4, null])).toBe(2);
    expect(recoveryHours([-2, -13, -14, -9, -5])).toBeNull();
  });
});

describe("countThresholds", () => {
  it("ignores empty cells and keeps thresholds increasing", () => {
    const thresholds = countThresholds([0, 0, 1, 1, 1, 1, 2, 3, 50]);
    expect(thresholds).toHaveLength(6);
    expect(thresholds.every((value, index) => index === 0 || value > (thresholds[index - 1] ?? 0))).toBe(true);
    expect(countThresholds([])).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("periods", () => {
  it("offers quick periods, then each year clipped to the data", () => {
    const options = periodOptions("2013-02-12", "2026-10-31");
    expect(options[0]).toMatchObject({ key: "30d", from: "2026-10-02", to: "2026-10-31" });
    expect(options[1]).toMatchObject({ key: "12m" });
    expect(options[2]).toMatchObject({ key: "2026", from: "2026-01-01", to: "2026-10-31" });
    expect(options.find((option) => option.key === "2013")).toMatchObject({ from: "2013-02-12", to: "2013-12-31" });
    expect(options.at(-1)).toMatchObject({ key: "all", from: "2013-02-12" });
  });
});

describe("helpers", () => {
  it("finds the busiest slot and compares with last year", () => {
    expect(busiestSlot([{ isoDayOfWeek: 1, hourOfDay: 8, incidents: 3 }, { isoDayOfWeek: 5, hourOfDay: 18, incidents: 9 }])).toEqual({
      isoDayOfWeek: 5,
      hourOfDay: 18,
      incidents: 9,
    });
    expect(changePct(110, 100)).toBeCloseTo(10);
    expect(changePct(5, null)).toBeNull();
  });
});
