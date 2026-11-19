"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useMemo, useState, useTransition, type MouseEvent } from "react";

const CELL_LON = 0.010986328125;
const CELL_LAT = 0.0054931640625;
// Cosine of 41 degrees, kept constant so the server and browser render identical coordinates.
const LON_SCALE = 0.75471;
const PADDING = 0.012;
const HIT_RADIUS_PIXELS = 16;

const round = (value: number) => Number(value.toFixed(6));
const projectX = (longitude: number, minLon: number) => round((longitude - minLon) * LON_SCALE);
const projectY = (latitude: number, maxLat: number) => round(maxLat - latitude);

export interface MapCell {
  id: string;
  latitude: number;
  longitude: number;
  /** Diverging color level from 1 to 7, computed on the server. */
  level: number;
  /** Tooltip rows: a value and what it means. */
  lines: { value: string; label: string }[];
}

interface MapCellsProps {
  cells: MapCell[];
  minLon: number;
  maxLat: number;
}

const MapCells = memo(function MapCells({ cells, minLon, maxLat }: MapCellsProps) {
  const width = round(CELL_LON * LON_SCALE);
  return (
    <g shapeRendering="crispEdges">
      {cells.map((cell) => (
        <rect
          fill={`var(--div-${cell.level})`}
          height={CELL_LAT}
          key={cell.id}
          width={width}
          x={round(projectX(cell.longitude, minLon) - width / 2)}
          y={round(projectY(cell.latitude, maxLat) - CELL_LAT / 2)}
        />
      ))}
    </g>
  );
});

interface CellMapProps {
  ariaLabel: string;
  cells: MapCell[];
  legend: { low: string; high: string };
  /** When set, clicking a cell writes its id to this URL parameter. */
  selectParam?: string;
  selected?: string | null;
}

export function CellMap({ ariaLabel, cells, legend, selectParam, selected = null }: CellMapProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [hovered, setHovered] = useState<MapCell | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0, width: 0 });

  const bounds = useMemo(() => {
    const longitudes = cells.map((cell) => cell.longitude);
    const latitudes = cells.map((cell) => cell.latitude);
    const minLon = Math.min(...longitudes) - PADDING;
    const maxLon = Math.max(...longitudes) + PADDING;
    const minLat = Math.min(...latitudes) - PADDING;
    const maxLat = Math.max(...latitudes) + PADDING;
    return { minLon, maxLat, width: round((maxLon - minLon) * LON_SCALE), height: round(maxLat - minLat) };
  }, [cells]);

  function nearestCell(event: MouseEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const unitsPerPixel = bounds.width / box.width;
    const x = (event.clientX - box.left) * unitsPerPixel;
    const y = (event.clientY - box.top) * unitsPerPixel;
    const limit = (HIT_RADIUS_PIXELS * unitsPerPixel) ** 2;

    let nearest: MapCell | null = null;
    let nearestDistance = limit;
    for (const cell of cells) {
      const dx = projectX(cell.longitude, bounds.minLon) - x;
      const dy = projectY(cell.latitude, bounds.maxLat) - y;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearest = cell;
        nearestDistance = distance;
      }
    }

    setPointer({ x: event.clientX - box.left, y: event.clientY - box.top, width: box.width });
    return nearest;
  }

  function selectCell(id: string) {
    if (!selectParam) {
      return;
    }
    const query = new URLSearchParams(searchParams);
    query.set(selectParam, id);
    startTransition(() => router.replace(`${pathname}?${query}`, { scroll: false }));
  }

  const selectedCell = cells.find((cell) => cell.id === selected);
  const cellWidth = CELL_LON * LON_SCALE;
  const tooltipFlips = pointer.x > pointer.width - 200;

  return (
    <div>
      <div className="chart" aria-busy={isPending}>
        <svg
          aria-label={ariaLabel}
          className={selectParam ? "map-svg selectable" : "map-svg"}
          role="img"
          viewBox={`0 0 ${bounds.width} ${bounds.height}`}
          onClick={(event) => {
            const cell = nearestCell(event);
            if (cell) {
              selectCell(cell.id);
            }
          }}
          onPointerLeave={() => setHovered(null)}
          onPointerMove={(event) => setHovered(nearestCell(event))}
        >
          <MapCells cells={cells} maxLat={bounds.maxLat} minLon={bounds.minLon} />
          {[selectedCell, hovered].map((cell, index) =>
            cell ? (
              <rect
                fill="none"
                height={round(CELL_LAT * 1.6)}
                key={index === 0 ? "selected" : "hovered"}
                stroke="var(--ink)"
                strokeWidth={index === 0 ? 2.5 : 1.5}
                vectorEffect="non-scaling-stroke"
                width={round(cellWidth * 1.6)}
                x={round(projectX(cell.longitude, bounds.minLon) - cellWidth * 0.8)}
                y={round(projectY(cell.latitude, bounds.maxLat) - CELL_LAT * 0.8)}
              />
            ) : null,
          )}
        </svg>

        {hovered ? (
          <div
            className="tooltip"
            style={{
              transform: `translate(${tooltipFlips ? pointer.x - 14 : pointer.x + 14}px, ${Math.max(0, pointer.y - 36)}px) translateX(${tooltipFlips ? "-100%" : "0"})`,
            }}
          >
            <div className="tooltip-title">Hücre {hovered.id}</div>
            {hovered.lines.map((line) => (
              <div className="tooltip-row" key={line.label}>
                <strong>{line.value}</strong>
                <span>{line.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="scale-legend" style={{ flexWrap: "wrap" }}>
        <span>{legend.low}</span>
        <span className="scale-swatches" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7].map((level) => (
            <span key={level} style={{ background: `var(--div-${level})` }} />
          ))}
        </span>
        <span>{legend.high}</span>
      </div>
    </div>
  );
}
