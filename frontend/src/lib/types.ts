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
