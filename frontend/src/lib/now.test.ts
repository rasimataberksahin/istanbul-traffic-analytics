import { describe, expect, it } from "vitest";
import { congestionLevel, dialAngle, incidentsPerWeek, istanbulClock, polar, ringSegment } from "@/lib/now";

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

describe("dial geometry", () => {
  it("puts midnight at the top and turns clockwise", () => {
    expect(dialAngle(0)).toBe(0);
    expect(dialAngle(6)).toBe(90);
    expect(dialAngle(18, 30)).toBe(277.5);
    expect(dialAngle(24)).toBe(0);
  });

  it("measures points from the top", () => {
    const [x, y] = polar(100, 100, 50, 0);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(50);
    const [rx, ry] = polar(100, 100, 50, 90);
    expect(rx).toBeCloseTo(150);
    expect(ry).toBeCloseTo(100);
  });

  it("draws a closed ring segment", () => {
    const path = ringSegment(100, 100, 40, 60, 0, 90);
    expect(path.startsWith("M100 40 A60 60 0 0 1 160 100 L140 100 A40 40 0 0 0 100 60")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });
});
