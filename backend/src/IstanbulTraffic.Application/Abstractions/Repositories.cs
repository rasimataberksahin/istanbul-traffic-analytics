using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Domain.Administration;

namespace IstanbulTraffic.Application.Abstractions;

public interface ITrafficAnalyticsRepository
{
    Task<TrafficTotals> GetTotalsAsync(TrafficFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<HourlyProfilePoint>> GetHourlyProfileAsync(TrafficFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<DailyTrendPoint>> GetDailyTrendAsync(TrafficFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<SpeedHeatmapCell>> GetHeatmapAsync(TrafficFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<DayTypeComparisonPoint>> GetDayTypeComparisonAsync(TrafficFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<SpeedBandShare>> GetSpeedBandsAsync(TrafficFilter filter, CancellationToken cancellationToken);

    Task<DatasetMetadata> GetMetadataAsync(CancellationToken cancellationToken);
}

public interface ILocationAnalyticsRepository
{
    Task<IReadOnlyList<SlowestLocation>> GetSlowestAsync(SlowestLocationsRequest request, CancellationToken cancellationToken);

    Task<IReadOnlyList<CongestionPoint>> GetCongestionMapAsync(TrafficFilter filter, CancellationToken cancellationToken);

    Task<LocationProfile?> GetProfileAsync(string geohash, TrafficFilter filter, CancellationToken cancellationToken);
}

public interface IInsightsRepository
{
    Task<IReadOnlyList<MonthlyInsight>> GetMonthlyAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<MonthHourCell>> GetMonthHourAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<DayOfWeekHourCell>> GetDayOfWeekHourAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<CalendarDay>> GetCalendarAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<PeriodProfilePoint>> GetPeriodProfilesAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<HolidayEffect>> GetHolidayEffectsAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<ReliabilityPoint>> GetReliabilityAsync(CancellationToken cancellationToken);

    Task<LocationChangeReport> GetLocationChangesAsync(CancellationToken cancellationToken);

    Task<WeatherReport> GetWeatherAsync(CancellationToken cancellationToken);
}

public interface IIncidentsRepository
{
    Task<IncidentMetadata> GetMetadataAsync(CancellationToken cancellationToken);

    Task<IncidentSummary> GetSummaryAsync(ResolvedIncidentFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<IncidentMonth>> GetMonthlyAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<IncidentWeekHour>> GetWeekHourAsync(ResolvedIncidentFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<IncidentCell>> GetCellsAsync(ResolvedIncidentFilter filter, CancellationToken cancellationToken);

    Task<IncidentCellDetail?> GetCellDetailAsync(string geohash, ResolvedIncidentFilter filter, CancellationToken cancellationToken);

    Task<IncidentRoads> GetRoadsAsync(ResolvedIncidentFilter filter, int limit, CancellationToken cancellationToken);

    Task<IncidentDurations> GetDurationsAsync(ResolvedIncidentFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<IncidentWeatherEffect>> GetWeatherAsync(ResolvedIncidentFilter filter, CancellationToken cancellationToken);

    Task<IncidentTrafficImpact> GetTrafficImpactAsync(CancellationToken cancellationToken);
}

public interface IPipelineSnapshotReader
{
    Task<IReadOnlyList<ImportSnapshot>> ReadAsync(CancellationToken cancellationToken);
}

public interface IAdminRepository
{
    Task<DataSource?> FindDataSourceAsync(string code, CancellationToken cancellationToken);

    Task<IReadOnlyList<DataSourceResponse>> ListDataSourcesAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<ImportRun>> GetImportRunsAsync(int dataSourceId, CancellationToken cancellationToken);

    Task<IReadOnlyList<ImportRunResponse>> ListImportRunsAsync(CancellationToken cancellationToken);

    void Add(ImportRun importRun);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
