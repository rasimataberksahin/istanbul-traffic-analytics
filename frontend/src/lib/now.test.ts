import { describe, expect, it } from "vitest";
import { congestionLevel, incidentsPerWeek, istanbulClock } from "@/lib/now";

describe("congestionLevel", () => {
  it("steps down from free flow", () => {
    expect(congestionLevel(60, 62)).toBe("free");
    expect(congestionLevel(50, 62)).toBe("moderate");
    expect(congestionLevel(42, 62)).toBe("heavy");
    expect(congestionLevel(30, 62)).toBe("severe");
  });
});

describe("istanbulClock", () => {
  it("reads the time in Istanbul, not the reader's zone", () => {
    // 20 Nov 2026 22:30 UTC is Saturday 01:30 in Istanbul.
    const clock = istanbulClock(new Date(Date.UTC(2026, 10, 20, 22, 30, 5)), "tr");
    expect(clock.hour).toBe(1);
    expect(clock.isoDay).toBe(6);
    expect(clock.time).toBe("01:30:05");
    expect(clock.weekdayName).toBe("Cumartesi");
  });
});

describe("incidentsPerWeek", () => {
  it("divides counts by the number of weeks", () => {
    const grid = incidentsPerWeek([{ isoDayOfWeek: 1, hourOfDay: 8, incidents: 140 }], 70);
    expect(grid[0]?.[8]).toBe(14);
    expect(grid[6]?.[23]).toBe(0);
  });
});
