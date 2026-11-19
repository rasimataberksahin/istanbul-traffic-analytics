/** Neighbourhood and district of a cell, as returned by the API. */
export interface Named {
  geohash: string;
  neighborhood?: string | null;
  district?: string | null;
}

export interface PlaceLabel {
  /** Neighbourhood, or the district when the neighbourhood is unknown. */
  title: string;
  /** District, or a note that the cell has no name. */
  subtitle: string;
  /** "Caferağa, Kadıköy" style text for tables and screen readers. */
  full: string;
}

/** A readable name for a cell. Cells without OpenStreetMap names fall back to their geohash. */
export function placeLabel(cell: Named, locale: "tr" | "en" = "tr"): PlaceLabel {
  const en = locale === "en";
  const neighborhood = cell.neighborhood?.trim() || null;
  const district = cell.district?.trim() || null;
  if (neighborhood && district) {
    return { title: neighborhood, subtitle: district, full: `${neighborhood}, ${district}` };
  }
  if (district) {
    return { title: district, subtitle: en ? "District" : "İlçe", full: district };
  }
  const cellName = `${en ? "Cell" : "Hücre"} ${cell.geohash}`;
  return { title: cellName, subtitle: en ? "No place name" : "Semt adı yok", full: cellName };
}

/** Lowercases with Turkish rules and strips accents, so "kadikoy" finds "Kadıköy". */
export function searchKey(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export interface DistrictSummary {
  district: string;
  cells: number;
  /** Vehicle-weighted evening peak speed over the district's cells. */
  peakSpeedKmh: number;
  /** 1 - peak / free flow, from vehicle-weighted speeds. */
  congestionIndex: number;
  /** The cell with the slowest evening peak. */
  slowest: { geohash: string; neighborhood: string | null; peakSpeedKmh: number };
}

interface DistrictInput extends Named {
  averagePeakVehicleCount: number;
  freeFlowSpeedKmh: number;
  peakSpeedKmh: number;
}

/**
 * Evening congestion per district. Speeds are weighted by each cell's evening vehicles,
 * the same rule the city-wide figures use. Districts with fewer cells than `minimumCells` are left out.
 */
export function summarizeDistricts(points: DistrictInput[], minimumCells = 5): DistrictSummary[] {
  const groups = new Map<string, DistrictInput[]>();
  for (const point of points) {
    const district = point.district?.trim();
    if (!district) {
      continue;
    }
    groups.set(district, [...(groups.get(district) ?? []), point]);
  }

  const summaries: DistrictSummary[] = [];
  for (const [district, cells] of groups) {
    if (cells.length < minimumCells) {
      continue;
    }
    let vehicles = 0;
    let peak = 0;
    let free = 0;
    for (const cell of cells) {
      const weight = Math.max(cell.averagePeakVehicleCount, 0);
      vehicles += weight;
      peak += cell.peakSpeedKmh * weight;
      free += cell.freeFlowSpeedKmh * weight;
    }
    if (vehicles === 0 || free === 0) {
      continue;
    }
    const slowest = cells.reduce((best, cell) => (cell.peakSpeedKmh < best.peakSpeedKmh ? cell : best));
    summaries.push({
      district,
      cells: cells.length,
      peakSpeedKmh: peak / vehicles,
      congestionIndex: 1 - peak / free,
      slowest: { geohash: slowest.geohash, neighborhood: slowest.neighborhood ?? null, peakSpeedKmh: slowest.peakSpeedKmh },
    });
  }
  return summaries.sort((a, b) => b.congestionIndex - a.congestionIndex || a.district.localeCompare(b.district, "tr"));
}
