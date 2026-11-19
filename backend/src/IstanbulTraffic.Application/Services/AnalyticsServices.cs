using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Application.Validation;

namespace IstanbulTraffic.Application.Services;

public sealed class TrafficAnalyticsService(ITrafficAnalyticsRepository repository)
{
    public async Task<TrafficSummary> GetSummaryAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        TrafficRequestValidator.Validate(filter);

        var totals = await repository.GetTotalsAsync(filter, cancellationToken);
        var hourly = await repository.GetHourlyProfileAsync(filter, cancellationToken);

        return new TrafficSummary(
            totals,
            hourly.MinBy(point => point.WeightedAverageSpeedKmh),
            hourly.MaxBy(point => point.WeightedAverageSpeedKmh));
    }

    public Task<IReadOnlyList<HourlyProfilePoint>> GetHourlyProfileAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        TrafficRequestValidator.Validate(filter);
        return repository.GetHourlyProfileAsync(filter, cancellationToken);
    }

    public Task<IReadOnlyList<DailyTrendPoint>> GetDailyTrendAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        TrafficRequestValidator.Validate(filter);
        return repository.GetDailyTrendAsync(filter, cancellationToken);
    }

    public Task<IReadOnlyList<SpeedHeatmapCell>> GetHeatmapAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        TrafficRequestValidator.Validate(filter);
        return repository.GetHeatmapAsync(filter, cancellationToken);
    }

    public Task<IReadOnlyList<DayTypeComparisonPoint>> GetDayTypeComparisonAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        TrafficRequestValidator.Validate(filter);
        return repository.GetDayTypeComparisonAsync(filter, cancellationToken);
    }

    public Task<IReadOnlyList<SpeedBandShare>> GetSpeedBandsAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        TrafficRequestValidator.Validate(filter);
        return repository.GetSpeedBandsAsync(filter, cancellationToken);
    }

    public Task<DatasetMetadata> GetMetadataAsync(CancellationToken cancellationToken) =>
        repository.GetMetadataAsync(cancellationToken);
}

public sealed class LocationAnalyticsService(ILocationAnalyticsRepository repository)
{
    public Task<IReadOnlyList<SlowestLocation>> GetSlowestAsync(SlowestLocationsRequest request, CancellationToken cancellationToken)
    {
        TrafficRequestValidator.Validate(request);
        return repository.GetSlowestAsync(request, cancellationToken);
    }

    public Task<IReadOnlyList<CongestionPoint>> GetCongestionMapAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        TrafficRequestValidator.Validate(filter);
        return repository.GetCongestionMapAsync(filter, cancellationToken);
    }

    public async Task<LocationProfile> GetProfileAsync(string geohash, TrafficFilter filter, CancellationToken cancellationToken)
    {
        TrafficRequestValidator.Validate(filter);
        var normalized = TrafficRequestValidator.NormalizeGeohash(geohash);

        return await repository.GetProfileAsync(normalized, filter, cancellationToken)
            ?? throw new ResourceNotFoundException($"Location '{normalized}' was not found.");
    }
}
