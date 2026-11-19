/** Width and height of a precision-6 geohash cell in degrees. */
export const CELL_LON = 0.010986328125;
export const CELL_LAT = 0.0054931640625;

/** Cells are drawn slightly smaller than the geohash so neighbours read as separate tiles. */
export const CELL_FILL_RATIO = 0.9;

/** How a mode turns a color level (1-7) into extrusion height in the 3D view. */
export type ExtrudeRule = "ascending" | "descending" | "magnitude";

export interface MapMode {
  id: string;
  label: string;
  /** "div" is the diverging blue-red scale, "heat" the sequential blue scale. */
  palette: "div" | "heat";
  /** Labels for level 1 (left) and level 7 (right) of the legend. */
  legend: { low: string; high: string };
  extrude: ExtrudeRule;
}

export interface MapCell {
  id: string;
  latitude: number;
  longitude: number;
  /** One color level from 1 to 7 per mode, in the same order as the modes. */
  levels: number[];
  /** Tooltip rows: a value and what it means. */
  lines: { value: string; label: string }[];
}

export interface Place {
  label: string;
  longitude: number;
  latitude: number;
  zoom: number;
}

/** Quick views over the places people usually ask about. */
export const PLACES: Place[] = [
  { label: "Tarihi Yarımada", longitude: 28.968, latitude: 41.011, zoom: 13.4 },
  { label: "15 Temmuz Köprüsü", longitude: 29.034, latitude: 41.046, zoom: 13.6 },
  { label: "FSM Köprüsü", longitude: 29.061, latitude: 41.091, zoom: 13.6 },
  { label: "Avrupa yakası", longitude: 28.86, latitude: 41.06, zoom: 11.2 },
  { label: "Anadolu yakası", longitude: 29.15, latitude: 40.99, zoom: 11.2 },
];

const BASE_HEIGHT_METERS = 40;
const STEP_HEIGHT_METERS = 230;

/** Extrusion height: the stronger the signal a level carries, the taller the cell. */
export function extrusionHeight(level: number, rule: ExtrudeRule): number {
  const clamped = Math.min(7, Math.max(1, Math.round(level)));
  const steps = rule === "ascending" ? clamped - 1 : rule === "descending" ? 7 - clamped : Math.abs(clamped - 4);
  return BASE_HEIGHT_METERS + steps * STEP_HEIGHT_METERS;
}

/** Closed polygon ring for a cell centred on the given point. */
export function cellRing(longitude: number, latitude: number, ratio = CELL_FILL_RATIO): [number, number][] {
  const halfLon = (CELL_LON * ratio) / 2;
  const halfLat = (CELL_LAT * ratio) / 2;
  const round = (value: number) => Number(value.toFixed(7));
  const west = round(longitude - halfLon);
  const east = round(longitude + halfLon);
  const south = round(latitude - halfLat);
  const north = round(latitude + halfLat);
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

export interface CellFeature {
  type: "Feature";
  id: number;
  properties: { id: string; level: number; height: number };
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
}

export interface CellCollection {
  type: "FeatureCollection";
  features: CellFeature[];
}

/** GeoJSON for one mode. Feature ids are array indexes so hover and selection can use feature state. */
export function cellFeatures(cells: MapCell[], modeIndex: number, rule: ExtrudeRule): CellCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((cell, index) => {
      const level = cell.levels[modeIndex] ?? 4;
      return {
        type: "Feature",
        id: index,
        properties: { id: cell.id, level, height: extrusionHeight(level, rule) },
        geometry: { type: "Polygon", coordinates: [cellRing(cell.longitude, cell.latitude)] },
      };
    }),
  };
}

/** Bounding box of all cells as [west, south, east, north], or null when there are none. */
export function cellBounds(cells: MapCell[]): [number, number, number, number] | null {
  if (cells.length === 0) {
    return null;
  }
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const cell of cells) {
    west = Math.min(west, cell.longitude - CELL_LON / 2);
    east = Math.max(east, cell.longitude + CELL_LON / 2);
    south = Math.min(south, cell.latitude - CELL_LAT / 2);
    north = Math.max(north, cell.latitude + CELL_LAT / 2);
  }
  return [west, south, east, north];
}

/** Class thresholds at the 1/7 ... 6/7 quantiles, for values without a fixed scale such as traffic volume. */
export function quantileThresholds(values: number[], classes = 7): number[] {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return [];
  }
  const thresholds: number[] = [];
  for (let step = 1; step < classes; step += 1) {
    const position = (sorted.length - 1) * (step / classes);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const low = sorted[lower] ?? 0;
    const high = sorted[upper] ?? low;
    thresholds.push(low + (high - low) * (position - lower));
  }
  return thresholds;
}
