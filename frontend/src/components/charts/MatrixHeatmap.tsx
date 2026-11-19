"use client";

import { useMemo, useState, type PointerEvent } from "react";
import { useChartWidth } from "@/components/charts/useChartWidth";
import { DataTable } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { classOf, HEAT_THRESHOLDS } from "@/lib/scale";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export interface MatrixRow {
  key: string;
  label: string;
  /** Longer description for the tooltip and table. */
  title: string;
}

export interface MatrixCell {
  row: string;
  hour: number;
  value: number | null;
}

interface MatrixHeatmapProps {
  ariaLabel: string;
  rows: MatrixRow[];
  cells: MatrixCell[];
  thresholds?: number[];
  rowHeight?: number;
  labelWidth?: number;
}

/** Rows by 24 hours, colored on the sequential speed ramp. Darker is slower. */
export function MatrixHeatmap({
  ariaLabel,
  rows,
  cells,
  thresholds = HEAT_THRESHOLDS,
  rowHeight = 16,
  labelWidth = 92,
}: MatrixHeatmapProps) {
  const { ref, width } = useChartWidth(1240);
  const [active, setActive] = useState<{ rowIndex: number; hour: number } | null>(null);
  const { t, f } = useI18n();
  const { formatDecimal, formatHour, formatSpeed, noData, speedUnit } = f;
  const margin = { top: 4, right: 0, bottom: 24, left: labelWidth };

  const values = useMemo(() => new Map(cells.map((cell) => [`${cell.row}|${cell.hour}`, cell.value])), [cells]);

  const cellWidth = Math.max((width - margin.left - margin.right) / 24, 8);
  const height = margin.top + rows.length * rowHeight + margin.bottom;
  const hourStep = width < 620 ? 6 : width < 900 ? 3 : 2;

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = width / bounds.width;
    const hour = Math.floor(((event.clientX - bounds.left) * scale - margin.left) / cellWidth);
    const rowIndex = Math.floor(((event.clientY - bounds.top) * scale - margin.top) / rowHeight);
    setActive(hour >= 0 && hour < 24 && rowIndex >= 0 && rowIndex < rows.length ? { rowIndex, hour } : null);
  }

  const activeRow = active ? rows[active.rowIndex] : undefined;
  const activeValue = active && activeRow ? values.get(`${activeRow.key}|${active.hour}`) : undefined;
  const tooltipX = active ? margin.left + active.hour * cellWidth + cellWidth + 8 : 0;
  const tooltipFlips = tooltipX > width - 190;

  return (
    <div>
      <div className="chart" ref={ref}>
        <svg
          aria-label={`${ariaLabel}. ${t("Tüm değerler aşağıdaki tabloda yer alır.", "All values are in the table below.")}`}
          height={height}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
          onPointerLeave={() => setActive(null)}
          onPointerMove={handlePointerMove}
        >
          {rows.map((row, rowIndex) => {
            const y = margin.top + rowIndex * rowHeight;
            return (
              <g key={row.key}>
                <text className="axis-text" dominantBaseline="middle" x={0} y={y + rowHeight / 2}>
                  {row.label}
                </text>
                {HOURS.map((hour) => {
                  const value = values.get(`${row.key}|${hour}`);
                  return (
                    <rect
                      fill={value === undefined || value === null ? "var(--missing)" : `var(--heat-${classOf(value, thresholds)})`}
                      height={rowHeight - 1}
                      key={hour}
                      width={Math.max(cellWidth - 1, 1)}
                      x={margin.left + hour * cellWidth}
                      y={y}
                    />
                  );
                })}
              </g>
            );
          })}

          {active ? (
            <rect
              fill="none"
              height={rowHeight - 1}
              stroke="var(--ink)"
              strokeWidth={1.5}
              width={Math.max(cellWidth - 1, 1)}
              x={margin.left + active.hour * cellWidth}
              y={margin.top + active.rowIndex * rowHeight}
            />
          ) : null}

          {HOURS.filter((hour) => hour % hourStep === 0).map((hour) => (
            <text className="axis-text" key={hour} x={margin.left + hour * cellWidth} y={height - 6}>
              {formatHour(hour)}
            </text>
          ))}
        </svg>

        {active && activeRow ? (
          <div
            className="tooltip"
            style={{
              transform: `translate(${tooltipFlips ? tooltipX - cellWidth - 16 : tooltipX}px, ${Math.max(0, margin.top + active.rowIndex * rowHeight - 20)}px) translateX(${tooltipFlips ? "-100%" : "0"})`,
            }}
          >
            <div className="tooltip-title">
              {activeRow.title}, {formatHour(active.hour)}
            </div>
            <div className="tooltip-row">
              <strong>{activeValue === undefined || activeValue === null ? noData : formatSpeed(activeValue)}</strong>
            </div>
          </div>
        ) : null}
      </div>

      <div className="scale-legend" aria-hidden="true">
        <span>{t(`${thresholds[0]} km/sa altı`, `below ${thresholds[0]} ${speedUnit}`)}</span>
        <span className="scale-swatches">
          {[1, 2, 3, 4, 5, 6, 7].map((level) => (
            <span key={level} style={{ background: `var(--heat-${level})` }} />
          ))}
        </span>
        <span>{t(`${thresholds.at(-1)} km/sa üstü`, `above ${thresholds.at(-1)} ${speedUnit}`)}</span>
      </div>

      <details className="table-toggle">
        <summary>{t("Tabloyu göster", "Show table")}</summary>
        <DataTable
          columns={["", ...HOURS.map(formatHour)]}
          rows={rows.map((row) => [
            row.title,
            ...HOURS.map((hour) => {
              const value = values.get(`${row.key}|${hour}`);
              return value === undefined || value === null ? "-" : formatDecimal(value);
            }),
          ])}
        />
      </details>
    </div>
  );
}
