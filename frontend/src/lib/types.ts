export type DayType = "all" | "weekday" | "weekend" | "holiday";

export interface DatasetMetadata {
  firstDate: string | null;
  lastDate: string | null;
  locationCount: number;
  loadedMonths: string[];
}

export interface HourlyPoint {
  hourOfDay: number;
  observationCount: number;
  vehicleObservations: number;
  weightedAverageSpeedKmh: number;
}

export interface TrafficSummary {
  totals: {
    firstDate: string | null;
    lastDate: string | null;
    observationCount: number;
    locationCount: number;
    vehicleObservations: number;
    weightedAverageSpeedKmh: number | null;
    simpleAverageSpeedKmh: number | null;
  };
  slowestHour: HourlyPoint | null;
  fastestHour: HourlyPoint | null;
}

export interface DailyPoint {
  date: string;
  dayName: string;
  hasPublicHoliday: boolean;
  vehicleObservations: number;
  weightedAverageSpeedKmh: number;
}

export interface HeatmapCell {
  date: string;
  hourOfDay: number;
  weightedAverageSpeedKmh: number;
}

export interface DayTypeComparisonPoint {
  hourOfDay: number;
  weekdaySpeedKmh: number | null;
  weekendSpeedKmh: number | null;
  weekendAdvantageKmh: number | null;
}

export interface SpeedBand {
  bandOrder: number;
  speedBand: string;
  observationCount: number;
  vehicleObservations: number;
  vehicleSharePct: number;
}

export interface SlowestLocation {
  rank: number;
  geohash: string;
  neighborhood: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  observedHours: number;
  averageVehicleCount: number;
  weightedAverageSpeedKmh: number;
}

export interface CongestionPoint {
  geohash: string;
  neighborhood: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  averagePeakVehicleCount: number;
  freeFlowSpeedKmh: number;
  peakSpeedKmh: number;
  congestionIndex: number;
}

export interface LocationProfile {
  location: {
    geohash: string;
    neighborhood: string | null;
    district: string | null;
    latitude: number;
    longitude: number;
    observationCount: number;
    vehicleSpeedCorrelation: number | null;
  };
  hourlyProfile: HourlyPoint[];
}

export interface DataSource {
  code: string;
  name: string;
  url: string;
  license: string;
  isActive: boolean;
}

export interface ImportRun {
  dataSourceCode: string;
  month: string;
  sourceFile: string;
  sourceSha256: string;
  rowCount: number;
  vehicleTotal: number;
  locationCount: number;
  loadedAt: string;
  syncedAt: string;
  qualityResults: { metric: string; rowCount: number; sharePct: number }[];
}

export interface MonthlyInsight {
  month: string;
  daysInMonth: number;
  observedHours: number;
  partialHours: number;
  coveragePct: number;
  rowCount: number;
  locationCount: number;
  vehicleObservations: number;
  averageVehicleCount: number;
  weightedAverageSpeedKmh: number | null;
  morningPeakSpeedKmh: number | null;
  eveningPeakSpeedKmh: number | null;
  nightSpeedKmh: number | null;
  congestionIndex: number | null;
  congestedHoursPerWeekday: number | null;
  /** Evening peak with cell weights fixed to their first-year vehicle shares. */
  fixedWeightEveningSpeedKmh: number | null;
  /** Evening peak of the median cell. */
  medianCellEveningSpeedKmh: number | null;
}

export interface MonthHourCell {
  month: string;
  hourOfDay: number;
  weightedAverageSpeedKmh: number | null;
}

export interface DayOfWeekHourCell {
  isoDayOfWeek: number;
  dayName: string;
  hourOfDay: number;
  weightedAverageSpeedKmh: number | null;
  averageVehicleCount: number;
}

export interface CalendarDay {
  date: string;
  dayName: string;
  isWeekend: boolean;
  hasPublicHoliday: boolean;
  observedHours: number;
  vehicleObservations: number;
  weightedAverageSpeedKmh: number | null;
  eveningSpeedKmh: number | null;
  periods: string | null;
}

export type PeriodKind = "school_term" | "school_break" | "summer_break" | "ramadan";

export interface PeriodProfilePoint {
  period: PeriodKind;
  days: number;
  hourOfDay: number;
  weightedAverageSpeedKmh: number | null;
  averageVehicleCount: number;
}

export interface HolidayEffect {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  days: number;
  holidaySpeedKmh: number | null;
  baselineSpeedKmh: number | null;
  speedChangeKmh: number | null;
  volumeChangePct: number | null;
}

export interface ReliabilityPoint {
  hourOfDay: number;
  days: number;
  p10SpeedKmh: number;
  p25SpeedKmh: number;
  medianSpeedKmh: number;
  p75SpeedKmh: number;
  p90SpeedKmh: number;
}

export interface LocationChange {
  geohash: string;
  neighborhood: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  previousPeakSpeedKmh: number;
  currentPeakSpeedKmh: number;
  speedChangeKmh: number;
  peakVolumeChangePct: number | null;
}

export interface LocationChangeReport {
  currentFrom: string | null;
  currentTo: string | null;
  previousFrom: string | null;
  previousTo: string | null;
  locations: LocationChange[];
}

export type WeatherConditionKind = "dry" | "light_rain" | "heavy_rain" | "snow";

export interface WeatherCondition {
  condition: WeatherConditionKind;
  hours: number;
  eveningHours: number;
  averageSpeedKmh: number | null;
  speedChangeKmh: number | null;
  eveningSpeedChangeKmh: number | null;
  volumeChangePct: number | null;
}

export interface WeatherReport {
  conditions: WeatherCondition[];
  hourly: { hourOfDay: number; rainHours: number; speedChangeKmh: number | null }[];
  districts: { district: string; cells: number; speedChangeKmh: number }[];
  wettestEvenings: {
    date: string;
    dayName: string;
    precipitationMm: number;
    snowfallCm: number | null;
    eveningSpeedKmh: number | null;
    speedChangeKmh: number | null;
  }[];
}

export type IncidentCategory =
  | "accident"
  | "breakdown"
  | "vehicle_fire"
  | "roadworks"
  | "closure"
  | "congestion"
  | "event"
  | "weather"
  | "other";

export type AccidentSeverity = "damage" | "injury" | "chain" | "fatal" | "unknown";

export interface IncidentMetadata {
  firstDate: string | null;
  lastDate: string | null;
  incidentCount: number;
  loadedAt: string | null;
  sourceFile: string | null;
  trafficFirstDate: string | null;
  trafficLastDate: string | null;
}

export interface IncidentCategoryCount {
  category: IncidentCategory;
  incidents: number;
  medianDurationMin: number | null;
  medianResponseMin: number | null;
  previousYearIncidents: number | null;
}

export interface IncidentSummary {
  filter: { from: string; to: string; category: IncidentCategory | null };
  days: number;
  categories: IncidentCategoryCount[];
  accidentSeverity: { severity: AccidentSeverity; incidents: number }[];
  closedLaneSharePct: number | null;
}

export interface IncidentMonth {
  month: string;
  category: IncidentCategory;
  incidents: number;
  severeAccidents: number;
}

export interface IncidentWeekHour {
  isoDayOfWeek: number;
  hourOfDay: number;
  incidents: number;
}

export interface IncidentCell {
  geohash: string;
  latitude: number;
  longitude: number;
  neighborhood: string | null;
  district: string | null;
  incidents: number;
  accidents: number;
  severeAccidents: number;
  breakdowns: number;
  roadworks: number;
  medianDurationMin: number | null;
}

export interface RoadSegment {
  road: string;
  segment: string | null;
  incidents: number;
  accidents: number;
  severeAccidents: number;
  breakdowns: number;
  medianDurationMin: number | null;
  geohash: string | null;
}

/** One of the newest announcements anywhere in the city. */
export interface LatestIncident {
  incidentId: number;
  startedAt: string;
  endedAt: string | null;
  category: IncidentCategory;
  severity: AccidentSeverity | null;
  title: string;
  road: string | null;
  durationMin: number | null;
  closedLanes: number | null;
  geohash: string;
  neighborhood: string | null;
  district: string | null;
}

export interface IncidentCellDetail {
  cell: IncidentCell;
  categories: IncidentCategoryCount[];
  hourly: number[];
  segments: RoadSegment[];
  latest: {
    incidentId: number;
    startedAt: string;
    category: IncidentCategory;
    severity: AccidentSeverity | null;
    title: string;
    durationMin: number | null;
    closedLanes: number | null;
  }[];
}

export interface IncidentRoads {
  roads: { road: string; incidents: number; accidents: number; severeAccidents: number }[];
  segments: RoadSegment[];
}

export interface IncidentDurations {
  categories: {
    category: IncidentCategory;
    incidents: number;
    medianDurationMin: number | null;
    p75DurationMin: number | null;
    p90DurationMin: number | null;
    medianResponseMin: number | null;
    responseCount: number;
  }[];
  yearly: { year: number; accidents: number; medianDurationMin: number | null; medianResponseMin: number | null; responseCount: number }[];
}

export interface IncidentWeatherEffect {
  condition: WeatherConditionKind;
  hours: number;
  accidents: number;
  expectedAccidents: number | null;
  rateRatio: number | null;
  severeRateRatio: number | null;
}

export interface IncidentTrafficImpact {
  from: string | null;
  to: string | null;
  matchedIncidents: number;
  recovery: { group: string; offsetHours: number; incidents: number; speedChangeKmh: number; speedChangePct: number }[];
  lanes: { closedLanes: number | null; accidents: number; speedChangeKmh: number }[];
  slowestEvenings: {
    date: string;
    dayName: string;
    eveningSpeedKmh: number;
    speedChangeKmh: number;
    accidents: number;
    severeAccidents: number;
    rainMm: number | null;
    largestIncident: string | null;
  }[];
  explanation: {
    evenings: number;
    slowWithRainPct: number;
    slowWithSevereAccidentPct: number;
    allWithRainPct: number;
    allWithSevereAccidentPct: number;
  } | null;
}
