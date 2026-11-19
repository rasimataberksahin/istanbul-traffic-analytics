"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useChartWidth } from "@/components/charts/useChartWidth";
import { useI18n } from "@/lib/i18n/client";
import { linearScale, linePath, niceScale } from "@/lib/scale";

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
}

export interface LineAnnotation {
  seriesId: string;
  index: number;
  text: string;
  placement?: "above" | "below";
}

interface LineChartProps {
  ariaLabel: string;
  labels: string[];
  ticks: { index: number; label: string }[];
  series: LineSeries[];
  formatValue: (value: number) => string;
  annotations?: LineAnnotation[];
  /** Colors individual points of the first series. */
  pointColors?: string[];
  height?: number;
}

const MARGIN = { top: 14, right: 16, bottom: 26, left: 38 };

export function LineChart({
  ariaLabel,
  labels,
  ticks,
  series,
  formatValue,
  annotations = [],
  pointColors,
  height = 290,
}: LineChartProps) {
  const { ref, width } = useChartWidth(820);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId();
  const { t, f } = useI18n();

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 40);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const lastIndex = Math.max(labels.length - 1, 1);

  const scale = useMemo(() => {
    const values = series.flatMap((item) => item.values).filter((value): value is number => value !== null);
    return niceScale(Math.min(...values), Math.max(...values), 5);
  }, [series]);

  const x = linearScale([0, lastIndex], [MARGIN.left, MARGIN.left + plotWidth]);
  const y = linearScale([scale.min, scale.max], [MARGIN.top + plotHeight, MARGIN.top]);

  function indexFromPointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left - MARGIN.left) / plotWidth;
    return Math.min(lastIndex, Math.max(0, Math.round(ratio * lastIndex)));
  }

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      setActiveIndex((current) => Math.min(lastIndex, Math.max(0, (current ?? (step > 0 ? -1 : 1)) + step)));
    } else if (event.key === "Escape") {
      setActiveIndex(null);
    }
  }

  const tooltipLeft = activeIndex === null ? 0 : x(activeIndex);
  const tooltipFlips = tooltipLeft > width - 170;

  return (
    <div>
      {series.length > 1 ? (
        <div className="legend">
          {series.map((item) => (
            <span className="legend-item" key={item.id}>
              <span className="key-line" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="chart" ref={ref}>
        <svg
          aria-label={`${ariaLabel}. ${t("Değerleri okumak için sol ve sağ ok tuşlarını kullanın.", "Use the left and right arrow keys to read values.")}`}
          height={height}
          role="img"
          tabIndex={0}
          viewBox={`0 0 ${width} ${height}`}
          onBlur={() => setActiveIndex(null)}
          onKeyDown={handleKeyDown}
          onPointerLeave={() => setActiveIndex(null)}
          onPointerMove={(event) => setActiveIndex(indexFromPointer(event))}
        >
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line stroke="var(--grid)" x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(tick)} y2={y(tick)} />
              <text className="axis-text" dominantBaseline="middle" textAnchor="end" x={MARGIN.left - 8} y={y(tick)}>
                {f.formatInteger(tick)}
              </text>
            </g>
          ))}

          {ticks.map((tick) => (
            <text className="axis-text" key={tick.index} textAnchor="middle" x={x(tick.index)} y={height - 6}>
              {tick.label}
            </text>
          ))}

          {activeIndex !== null ? (
            <line stroke="var(--axis)" x1={x(activeIndex)} x2={x(activeIndex)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} />
          ) : null}

          {(() => {
            // A single unbroken series gets a soft area under its line.
            const only = series.length === 1 && !pointColors ? series[0] : undefined;
            if (!only || only.values.some((value) => value === null)) {
              return null;
            }
            const line = linePath(only.values.map((value, index) => ({ x: x(index), y: y(value ?? 0) })));
            const bottom = MARGIN.top + plotHeight;
            return (
              <>
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={only.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={only.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <path
                  className="chart-area"
                  d={`${line}L${x(lastIndex)},${bottom}L${x(0)},${bottom}Z`}
                  fill={`url(#${gradientId})`}
                />
              </>
            );
          })()}

          {series.map((item, seriesIndex) => (
            <g key={item.id}>
              <path
                className="chart-line"
                d={linePath(item.values.map((value, index) => (value === null ? null : { x: x(index), y: y(value) })))}
                fill="none"
                pathLength={1}
                stroke={pointColors && seriesIndex === 0 ? "var(--series-muted)" : item.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
              {pointColors && seriesIndex === 0
                ? item.values.map((value, index) =>
                    value === null ? null : (
                      <circle
                        cx={x(index)}
                        cy={y(value)}
                        fill={pointColors[index] ?? item.color}
                        key={labels[index]}
                        r={4.5}
                        stroke="var(--surface)"
                        strokeWidth={2}
                      />
                    ),
                  )
                : null}
            </g>
          ))}

          {annotations.map((annotation) => {
            const item = series.find((candidate) => candidate.id === annotation.seriesId);
            const value = item?.values[annotation.index];
            if (!item || value === null || value === undefined) {
              return null;
            }
            const anchor = x(annotation.index) > width - 110 ? "end" : x(annotation.index) < 110 ? "start" : "middle";
            const offset = annotation.placement === "above" ? -12 : 20;
            return (
              <g key={`${annotation.seriesId}-${annotation.index}`}>
                <circle cx={x(annotation.index)} cy={y(value)} fill={item.color} r={4.5} stroke="var(--surface)" strokeWidth={2} />
                <text className="annotation-text" textAnchor={anchor} x={x(annotation.index)} y={y(value) + offset}>
                  {annotation.text}
                </text>
              </g>
            );
          })}

          {activeIndex !== null
            ? series.map((item) => {
                const value = item.values[activeIndex];
                return value === null || value === undefined ? null : (
                  <circle cx={x(activeIndex)} cy={y(value)} fill={item.color} key={item.id} r={4.5} stroke="var(--surface)" strokeWidth={2} />
                );
              })
            : null}
        </svg>

        {activeIndex !== null ? (
          <div
            className="tooltip"
            style={{
              transform: `translate(${tooltipFlips ? tooltipLeft - 12 : tooltipLeft + 12}px, ${MARGIN.top}px) translateX(${tooltipFlips ? "-100%" : "0"})`,
            }}
          >
            <div className="tooltip-title">{labels[activeIndex]}</div>
            {series.map((item) => {
              const value = item.values[activeIndex];
              return (
                <div className="tooltip-row" key={item.id}>
                  <span className="key-line" style={{ background: pointColors?.[activeIndex] ?? item.color }} />
                  <strong>{value === null || value === undefined ? f.noData : formatValue(value)}</strong>
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
