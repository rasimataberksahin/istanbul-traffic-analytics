import { describe, expect, it } from "vitest";
import {
  compareYears,
  findVolumeBreak,
  groupPeriods,
  maximumHour,
  minimumHour,
  rankWeekdays,
  spansBreak,
  widestSpread,
} from "@/lib/insights";
import type { CalendarDay, MonthlyInsight, PeriodProfilePoint, ReliabilityPoint } from "@/lib/types";

function month(value: string, speed: number | null): MonthlyInsight {
  return {
    month: value,
    daysInMonth: 30,
    observedHours: 720,
    partialHours: 0,
    coveragePct: 100,
    rowCount: 1,
    locationCount: 1,
    vehicleObservations: 1,
    averageVehicleCount: 1,
    weightedAverageSpeedKmh: speed,
    morningPeakSpeedKmh: speed,
    eveningPeakSpeedKmh: speed,
    nightSpeedKmh: speed,
    congestionIndex: null,
    congestedHoursPerWeekday: null,
  };
}

function day(date: string, eveningSpeedKmh: number | null, extra: Partial<CalendarDay> = {}): CalendarDay {
  return {
    date,
    dayName: "Salı",
    isWeekend: false,
    hasPublicHoliday: false,
    observedHours: 24,
    vehicleObservations: 1,
    weightedAverageSpeedKmh: eveningSpeedKmh,
    eveningSpeedKmh,
    periods: null,
    ...extra,
  };
}

const monthKey = (year: number, index: number) => `${year}-${String(index + 1).padStart(2, "0")}-01`;

describe("compareYears", () => {
  const months = [
    ...Array.from({ length: 12 }, (_, index) => month(monthKey(2023, index), 50)),
    ...Array.from({ length: 12 }, (_, index) => month(monthKey(2024, index), 48)),
    month("2025-01-01", 60),
  ];

  it("compares the latest mostly complete year with the year before", () => {
    const comparison = compareYears(months, (item) => item.eveningPeakSpeedKmh);

    expect(comparison?.currentYear).toBe(2024);
    expect(comparison?.previousYear).toBe(2023);
    expect(comparison?.pairs[0]).toEqual({ monthIndex: 0, previous: 50, current: 48, change: -2 });
    expect(comparison?.averageChange).toBe(-2);
  });

  it("skips months without a value in both years", () => {
    const withGap = months.map((item) => (item.month === "2023-04-01" ? month(item.month, null) : item));
    const comparison = compareYears(withGap, (item) => item.eveningPeakSpeedKmh);

    expect(comparison?.pairs[3]?.change).toBeNull();
  });

  it("returns null with a single year", () => {
    expect(compareYears(months.slice(12, 24), (item) => item.eveningPeakSpeedKmh)).toBeNull();
  });
});

describe("rankWeekdays", () => {
  it("ranks only regular weekdays with enough data", () => {
    const days = [
      day("2024-01-02", 40),
      day("2024-01-03", 30),
      day("2024-01-06", 20, { isWeekend: true }),
      day("2024-01-01", 25, { hasPublicHoliday: true }),
      day("2024-01-04", 10, { observedHours: 12 }),
      day("2024-01-05", 55),
    ];

    const { slowest, fastest } = rankWeekdays(days, 2);

    expect(slowest.map((item) => item.date)).toEqual(["2024-01-03", "2024-01-02"]);
    expect(fastest.map((item) => item.date)).toEqual(["2024-01-05", "2024-01-02"]);
  });
});

describe("groupPeriods", () => {
  it("orders the periods and fills missing hours with null", () => {
    const points: PeriodProfilePoint[] = [
      { period: "ramadan", days: 20, hourOfDay: 18, weightedAverageSpeedKmh: 44, averageVehicleCount: 30 },
      { period: "school_term", days: 300, hourOfDay: 18, weightedAverageSpeedKmh: 46, averageVehicleCount: 35 },
    ];

    const groups = groupPeriods(points);

    expect(groups.map((group) => group.period)).toEqual(["school_term", "ramadan"]);
    expect(groups[1]?.speeds[18]).toBe(44);
    expect(groups[1]?.speeds[17]).toBeNull();
  });
});

describe("hour extremes", () => {
  const values = [70, 68, null, 50, 52, 49, 60];

  it("finds the minimum inside a window", () => {
    expect(minimumHour(values)).toEqual({ hour: 5, value: 49 });
    expect(minimumHour(values, 0, 4)).toEqual({ hour: 3, value: 50 });
  });

  it("finds the maximum and skips missing hours", () => {
    expect(maximumHour(values, 1, 6)).toEqual({ hour: 1, value: 68 });
  });
});

describe("widestSpread", () => {
  it("picks the hour with the widest 10-90 percentile band", () => {
    const point = (hourOfDay: number, p10: number, p90: number): ReliabilityPoint => ({
      hourOfDay,
      days: 10,
      p10SpeedKmh: p10,
      p25SpeedKmh: p10,
      medianSpeedKmh: (p10 + p90) / 2,
      p75SpeedKmh: p90,
      p90SpeedKmh: p90,
    });

    expect(widestSpread([point(3, 60, 64), point(18, 40, 52), point(8, 45, 50)])?.hourOfDay).toBe(18);
  });
});

describe("findVolumeBreak", () => {
  const withVehicles = (value: string, vehicles: number): MonthlyInsight => ({ ...month(value, 50), averageVehicleCount: vehicles });

  it("finds the largest jump above the threshold", () => {
    const months = [withVehicles("2024-01-01", 84.5), withVehicles("2024-02-01", 113.7), withVehicles("2024-03-01", 113.5)];

    const result = findVolumeBreak(months);

    expect(result?.month).toBe("2024-02-01");
    expect(result?.changePct).toBeCloseTo(34.6, 1);
  });

  it("ignores normal seasonal movement", () => {
    expect(findVolumeBreak([withVehicles("2023-07-01", 67.7), withVehicles("2023-08-01", 64.7)])).toBeNull();
  });

  it("tells whether two periods sit on different sides of the break", () => {
    const result = findVolumeBreak([withVehicles("2024-01-01", 84.5), withVehicles("2024-02-01", 113.7)]);

    expect(spansBreak(result, "2023-10-01", "2024-10-31")).toBe(true);
    expect(spansBreak(result, "2024-03-01", "2025-01-31")).toBe(false);
  });
});
