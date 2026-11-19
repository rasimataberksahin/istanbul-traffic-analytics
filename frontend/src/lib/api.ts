import type { DashboardFilter } from "@/lib/filters";
import type {
  CalendarDay,
  CongestionPoint,
  DailyPoint,
  DataSource,
  DatasetMetadata,
  DayOfWeekHourCell,
  DayTypeComparisonPoint,
  HeatmapCell,
  HolidayEffect,
  HourlyPoint,
  ImportRun,
  LocationChangeReport,
  LocationProfile,
  MonthHourCell,
  MonthlyInsight,
  PeriodProfilePoint,
  ReliabilityPoint,
  SlowestLocation,
  SpeedBand,
  TrafficSummary,
  WeatherReport,
} from "@/lib/types";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:5088";
const REVALIDATE_SECONDS = 300;

type QueryValue = string | number | undefined;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`API request to ${path} failed with status ${status}.`);
  }
}

function buildUrl(path: string, query: Record<string, QueryValue>): URL {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function get<T>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
  const response = await fetch(buildUrl(path, query), { next: { revalidate: REVALIDATE_SECONDS } });
  if (!response.ok) {
    throw new ApiError(response.status, path);
  }
  return (await response.json()) as T;
}

function toQuery(filter: DashboardFilter): Record<string, QueryValue> {
  return {
    from: filter.from,
    to: filter.to,
    dayType: filter.dayType === "all" ? undefined : filter.dayType,
  };
}

export const getMetadata = () => get<DatasetMetadata>("/api/v1/metadata");

export const getSummary = (filter: DashboardFilter) =>
  get<TrafficSummary>("/api/v1/traffic/summary", toQuery(filter));

export const getHourlyProfile = (filter: DashboardFilter) =>
  get<HourlyPoint[]>("/api/v1/traffic/hourly-profile", toQuery(filter));

export const getDailyTrend = (filter: DashboardFilter) =>
  get<DailyPoint[]>("/api/v1/traffic/daily-trend", toQuery(filter));

export const getHeatmap = (filter: DashboardFilter) =>
  get<HeatmapCell[]>("/api/v1/traffic/heatmap", toQuery(filter));

export const getDayTypeComparison = (filter: DashboardFilter) =>
  get<DayTypeComparisonPoint[]>("/api/v1/traffic/day-type-comparison", {
    from: filter.from,
    to: filter.to,
  });

export const getSpeedBands = (filter: DashboardFilter) =>
  get<SpeedBand[]>("/api/v1/traffic/speed-bands", toQuery(filter));

export const getCongestionMap = (filter: DashboardFilter) =>
  get<CongestionPoint[]>("/api/v1/locations/congestion-map", { from: filter.from, to: filter.to });

export const getSlowestLocations = (filter: DashboardFilter, limit: number) =>
  get<SlowestLocation[]>("/api/v1/locations/slowest", {
    from: filter.from,
    to: filter.to,
    dayType: "weekday",
    limit,
  });

export async function getLocationProfile(
  geohash: string,
  filter: DashboardFilter,
): Promise<LocationProfile | null> {
  try {
    return await get<LocationProfile>(`/api/v1/locations/${encodeURIComponent(geohash)}/profile`, {
      from: filter.from,
      to: filter.to,
      dayType: "weekday",
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export const getDataSources = () => get<DataSource[]>("/api/v1/pipeline/data-sources");

export const getImportRuns = () => get<ImportRun[]>("/api/v1/pipeline/import-runs");

export const getMonthlyInsights = () => get<MonthlyInsight[]>("/api/v1/insights/monthly");

export const getMonthHour = () => get<MonthHourCell[]>("/api/v1/insights/month-hour");

export const getDayOfWeekHour = () => get<DayOfWeekHourCell[]>("/api/v1/insights/day-of-week");

export const getCalendar = () => get<CalendarDay[]>("/api/v1/insights/calendar");

export const getPeriodProfiles = () => get<PeriodProfilePoint[]>("/api/v1/insights/periods");

export const getHolidayEffects = () => get<HolidayEffect[]>("/api/v1/insights/holidays");

export const getReliability = () => get<ReliabilityPoint[]>("/api/v1/insights/reliability");

export const getLocationChanges = () => get<LocationChangeReport>("/api/v1/insights/location-changes");

export const getWeather = () => get<WeatherReport>("/api/v1/insights/weather");
