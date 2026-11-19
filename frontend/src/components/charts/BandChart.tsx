"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { useChartWidth } from "@/components/charts/useChartWidth";
import { useI18n } from "@/lib/i18n/client";
import { linearScale, linePath, niceScale } from "@/lib/scale";
import type { ReliabilityPoint } from "@/lib/types";

const MARGIN = { top: 14, right: 16, bottom: 26, left: 38 };
const HEIGHT = 290;

function areaPath(points: { x: number; low: number; high: number }[]): string {
  const top = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.high.toFixed(2)}`);
  const bottom = [...points].reverse().map((point) => `L${point.x.toFixed(2)} ${point.low.toFixed(2)}`);
  return `${top.join("")}${bottom.join("")}Z`;
}

/** Median line with the 25-75 and 10-90 percentile bands of the daily speed at each hour. */
export function BandChart({ points }: { points: ReliabilityPoint[] }) {
  const { ref, width } = useChartWidth(820);
  const [active, setActive] = useState<number | null>(null);
  const { t, f } = useI18n();
  const { formatHour, formatSpeed } = f;

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 40);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const scale = niceScale(
    Math.min(...points.map((point) => point.p10SpeedKmh)),
    Math.max(...points.map((point) => point.p90SpeedKmh)),
    5,
  );
  const x = linearScale([0, 23], [MARGIN.left, MARGIN.left + plotWidth]);
  const y = linearScale([scale.min, scale.max], [MARGIN.top + plotHeight, MARGIN.top]);

  const outer = areaPath(points.map((point) => ({ x: x(point.hourOfDay), low: y(point.p10SpeedKmh), high: y(point.p90SpeedKmh) })));
  const inner = areaPath(points.map((point) => ({ x: x(point.hourOfDay), low: y(point.p25SpeedKmh), high: y(point.p75SpeedKmh) })));
  const median = linePath(points.map((point) => ({ x: x(point.hourOfDay), y: y(point.medianSpeedKmh) })));

  function hourFromPointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = ((event.clientX - bounds.left) * (width / bounds.width) - MARGIN.left) / plotWidth;
    return Math.min(23, Math.max(0, Math.round(ratio * 23)));
  }

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      setActive((current) => Math.min(23, Math.max(0, (current ?? (step > 0 ? -1 : 1)) + step)));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const activePoint = points.find((point) => point.hourOfDay === active);
  const tooltipLeft = active === null ? 0 : x(active);
  const tooltipFlips = tooltipLeft > width - 190;

  return (
    <div>
      <div className="legend">
        <span className="legend-item">
          <span className="key-line" style={{ background: "var(--series-1)" }} />
          {t("Medyan gün", "Median day")}
        </span>
        <span className="legend-item">
          <span className="key-swatch" style={{ background: "var(--band-inner)" }} />
          {t("Günlerin yarısı (25-75. yüzdelik)", "Half of days (25th-75th percentile)")}
        </span>
        <span className="legend-item">
          <span className="key-swatch" style={{ background: "var(--band-outer)" }} />
          {t("Günlerin %80'i (10-90. yüzdelik)", "80% of days (10th-90th percentile)")}
        </span>
      </div>
      <div className="chart" ref={ref}>
        <svg
          aria-label={t("Hafta içi saatlere göre günlük hız dağılımı. Değerleri okumak için sol ve sağ ok tuşlarını kullanın.", "Daily speed distribution by weekday hour. Use the left and right arrow keys to read values.")}
          height={HEIGHT}
          role="img"
          tabIndex={0}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          onBlur={() => setActive(null)}
          onKeyDown={handleKeyDown}
          onPointerLeave={() => setActive(null)}
          onPointerMove={(event) => setActive(hourFromPointer(event))}
        >
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line stroke="var(--grid)" x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(tick)} y2={y(tick)} />
              <text className="axis-text" dominantBaseline="middle" textAnchor="end" x={MARGIN.left - 8} y={y(tick)}>
                {tick.toLocaleString("tr-TR")}
              </text>
            </g>
          ))}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
            <text className="axis-text" key={hour} textAnchor="middle" x={x(hour)} y={HEIGHT - 6}>
              {formatHour(hour)}
            </text>
          ))}
          <path d={outer} fill="var(--band-outer)" />
          <path d={inner} fill="var(--band-inner)" />
          <path d={median} fill="none" stroke="var(--series-1)" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          {activePoint ? (
            <>
              <line stroke="var(--axis)" x1={x(activePoint.hourOfDay)} x2={x(activePoint.hourOfDay)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} />
              <circle cx={x(activePoint.hourOfDay)} cy={y(activePoint.medianSpeedKmh)} fill="var(--series-1)" r={4.5} stroke="var(--surface)" strokeWidth={2} />
            </>
          ) : null}
        </svg>

        {activePoint ? (
          <div
            className="tooltip"
            style={{
              transform: `translate(${tooltipFlips ? tooltipLeft - 12 : tooltipLeft + 12}px, ${MARGIN.top}px) translateX(${tooltipFlips ? "-100%" : "0"})`,
            }}
          >
            <div className="tooltip-title">
              {formatHour(activePoint.hourOfDay)}, {t(`${activePoint.days} hafta içi günü`, `${activePoint.days} weekdays`)}
            </div>
            <div className="tooltip-row">
              <strong>{formatSpeed(activePoint.p90SpeedKmh)}</strong>
              <span>{t("iyi gün (90.)", "good day (90th)")}</span>
            </div>
            <div className="tooltip-row">
              <strong>{formatSpeed(activePoint.medianSpeedKmh)}</strong>
              <span>{t("medyan", "median")}</span>
            </div>
            <div className="tooltip-row">
              <strong>{formatSpeed(activePoint.p10SpeedKmh)}</strong>
              <span>{t("kötü gün (10.)", "bad day (10th)")}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
