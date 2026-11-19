"use client";

import { useMemo, useState, type PointerEvent } from "react";
import { useChartWidth } from "@/components/charts/useChartWidth";
import { useI18n } from "@/lib/i18n/client";
import { dayName, term } from "@/lib/i18n/terms";
import { classOf } from "@/lib/scale";
import type { CalendarDay } from "@/lib/types";

const WEEKDAY_LABELS = ["Pzt", "", "Çar", "", "Cum", "", "Paz"];
const WEEKDAY_LABELS_EN = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
const LABEL_WIDTH = 34;
const MONTH_ROW = 18;
const YEAR_GAP = 26;
const MAX_CELL = 17;

interface Placed {
  day: CalendarDay;
  column: number;
  row: number;
}

const isoWeekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

function dayOfYear(date: string): number {
  const time = new Date(`${date}T00:00:00Z`).getTime();
  return Math.round((time - Date.UTC(Number(date.slice(0, 4)), 0, 1)) / 86_400_000);
}

/** Places each day of a year on a week-by-weekday grid that starts on Monday. */
function placeYear(year: number, days: CalendarDay[]): Placed[] {
  const offset = isoWeekday(`${year}-01-01`);
  return days.map((day) => ({ day, column: Math.floor((dayOfYear(day.date) + offset) / 7), row: isoWeekday(day.date) }));
}

/** One square per day, colored by the 17:00-19:59 city speed. Holidays carry a dot. */
export function CalendarHeatmap({ days, thresholds }: { days: CalendarDay[]; thresholds: number[] }) {
  const { ref, width } = useChartWidth(1100);
  const [active, setActive] = useState<Placed | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const { locale, t, f } = useI18n();
  const { formatLongDate, formatMonthIndex, formatSpeed } = f;

  const years = useMemo(() => {
    const grouped = new Map<number, CalendarDay[]>();
    for (const day of days) {
      const year = Number(day.date.slice(0, 4));
      grouped.set(year, [...(grouped.get(year) ?? []), day]);
    }
    return [...grouped.entries()].map(([year, items]) => ({ year, placed: placeYear(year, items) }));
  }, [days]);

  const cell = Math.min(MAX_CELL, Math.max(6, Math.floor((width - LABEL_WIDTH) / 54)));
  const blockHeight = MONTH_ROW + cell * 7;
  const height = years.length * (blockHeight + YEAR_GAP) - YEAR_GAP + 4;

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = width / bounds.width;
    const x = (event.clientX - bounds.left) * scale;
    const y = (event.clientY - bounds.top) * scale;
    const blockIndex = Math.floor(y / (blockHeight + YEAR_GAP));
    const block = years[blockIndex];
    const localY = y - blockIndex * (blockHeight + YEAR_GAP) - MONTH_ROW;
    const column = Math.floor((x - LABEL_WIDTH) / cell);
    const row = Math.floor(localY / cell);
    setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    setActive(block?.placed.find((item) => item.column === column && item.row === row) ?? null);
  }

  const tooltipFlips = pointer.x > width - 240;

  return (
    <div>
      <div className="chart calendar" ref={ref}>
        <svg
          aria-label={t("Takvim ısı haritası: her kare bir gündür, renk akşam 17:00-19:59 şehir hızını gösterir. Günlük değerler sayfadaki tablolarda yer alır.", "Calendar heatmap: each square is a day, colored by the 17:00-19:59 city speed. Daily values are in the tables on this page.")}
          height={height}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
          onPointerLeave={() => setActive(null)}
          onPointerMove={handlePointerMove}
        >
          {years.map(({ year, placed }, blockIndex) => {
            const top = blockIndex * (blockHeight + YEAR_GAP);
            const monthStarts = placed.filter((item) => item.day.date.endsWith("-01"));
            return (
              <g key={year}>
                <text className="calendar-year" x={0} y={top + 12}>
                  {year}
                </text>
                {monthStarts.map((item) => (
                  <text
                    className="axis-text"
                    key={item.day.date}
                    x={LABEL_WIDTH + item.column * cell}
                    y={top + 12}
                  >
                    {formatMonthIndex(Number(item.day.date.slice(5, 7)) - 1)}
                  </text>
                ))}
                {(locale === "en" ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS).map((label, row) =>
                  label ? (
                    <text
                      className="axis-text"
                      dominantBaseline="middle"
                      key={label}
                      x={0}
                      y={top + MONTH_ROW + row * cell + cell / 2}
                    >
                      {label}
                    </text>
                  ) : null,
                )}
                {placed.map((item) => {
                  const speed = item.day.eveningSpeedKmh;
                  const x = LABEL_WIDTH + item.column * cell;
                  const y = top + MONTH_ROW + item.row * cell;
                  return (
                    <g key={item.day.date}>
                      <rect
                        fill={speed === null ? "var(--missing)" : `var(--heat-${classOf(speed, thresholds)})`}
                        height={cell - 2}
                        rx={2}
                        width={cell - 2}
                        x={x}
                        y={y}
                      />
                      {item.day.hasPublicHoliday ? (
                        <circle cx={x + (cell - 2) / 2} cy={y + (cell - 2) / 2} fill="var(--surface)" r={Math.max(1.6, cell / 7)} stroke="var(--ink)" strokeWidth={1} />
                      ) : null}
                    </g>
                  );
                })}
                {active && placed.includes(active) ? (
                  <rect
                    fill="none"
                    height={cell - 2}
                    rx={2}
                    stroke="var(--ink)"
                    strokeWidth={1.5}
                    width={cell - 2}
                    x={LABEL_WIDTH + active.column * cell}
                    y={top + MONTH_ROW + active.row * cell}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>

        {active ? (
          <div
            className="tooltip"
            style={{
              transform: `translate(${tooltipFlips ? pointer.x - 14 : pointer.x + 14}px, ${Math.max(0, pointer.y - 30)}px) translateX(${tooltipFlips ? "-100%" : "0"})`,
            }}
          >
            <div className="tooltip-title">
              {formatLongDate(active.day.date)}, {dayName(active.day.dayName, locale)}
            </div>
            <div className="tooltip-row">
              <strong>{formatSpeed(active.day.eveningSpeedKmh)}</strong>
              <span>{t("akşam", "evening")}</span>
            </div>
            <div className="tooltip-row">
              <strong>{formatSpeed(active.day.weightedAverageSpeedKmh)}</strong>
              <span>{t("gün geneli", "all day")}</span>
            </div>
            {active.day.periods ? <div className="tooltip-note">{term(active.day.periods, locale)}</div> : null}
            {active.day.observedHours < 24 ? (
              <div className="tooltip-note">{t(`${active.day.observedHours} saat analiz edilebilir veri`, `${active.day.observedHours} hours of usable data`)}</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="scale-legend" style={{ flexWrap: "wrap" }}>
        <span>{t(`${thresholds[0]} km/sa altı`, `below ${thresholds[0]} km/h`)}</span>
        <span className="scale-swatches" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7].map((level) => (
            <span key={level} style={{ background: `var(--heat-${level})` }} />
          ))}
        </span>
        <span>{t(`${thresholds.at(-1)} km/sa üstü`, `above ${thresholds.at(-1)} km/h`)}</span>
        <span className="legend-item" style={{ marginLeft: 12 }}>
          <span className="key-ring" aria-hidden="true" />
          {t("Resmî tatil", "Public holiday")}
        </span>
      </div>
    </div>
  );
}
