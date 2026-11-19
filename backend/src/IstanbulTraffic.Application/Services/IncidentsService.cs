using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Application.Validation;
using IstanbulTraffic.Domain.Incidents;

namespace IstanbulTraffic.Application.Services;

public sealed class IncidentsService(IIncidentsRepository repository)
{
    public Task<IncidentMetadata> GetMetadataAsync(CancellationToken cancellationToken) =>
        repository.GetMetadataAsync(cancellationToken);

    public async Task<IncidentSummary> GetSummaryAsync(IncidentFilter filter, CancellationToken cancellationToken) =>
        await repository.GetSummaryAsync(await ResolveAsync(filter, cancellationToken), cancellationToken);

    public Task<IReadOnlyList<IncidentMonth>> GetMonthlyAsync(CancellationToken cancellationToken) =>
        repository.GetMonthlyAsync(cancellationToken);

    public async Task<IReadOnlyList<IncidentWeekHour>> GetWeekHourAsync(IncidentFilter filter, CancellationToken cancellationToken) =>
        await repository.GetWeekHourAsync(await ResolveAsync(filter, cancellationToken), cancellationToken);

    public async Task<IReadOnlyList<IncidentCell>> GetCellsAsync(IncidentFilter filter, CancellationToken cancellationToken) =>
        await repository.GetCellsAsync(await ResolveAsync(filter, cancellationToken), cancellationToken);

    public async Task<IncidentCellDetail> GetCellDetailAsync(string geohash, IncidentFilter filter, CancellationToken cancellationToken)
    {
        var normalized = TrafficRequestValidator.NormalizeGeohash(geohash);
        var resolved = await ResolveAsync(filter, cancellationToken);
        return await repository.GetCellDetailAsync(normalized, resolved, cancellationToken)
            ?? throw new ResourceNotFoundException($"No incidents in cell '{normalized}' for the selected period.");
    }

    public async Task<IncidentRoads> GetRoadsAsync(IncidentFilter filter, int limit, CancellationToken cancellationToken)
    {
        IncidentRequestValidator.ValidateLimit(limit);
        return await repository.GetRoadsAsync(await ResolveAsync(filter, cancellationToken), limit, cancellationToken);
    }

    public async Task<IncidentDurations> GetDurationsAsync(IncidentFilter filter, CancellationToken cancellationToken) =>
        await repository.GetDurationsAsync(await ResolveAsync(filter, cancellationToken), cancellationToken);

    public async Task<IReadOnlyList<IncidentWeatherEffect>> GetWeatherAsync(IncidentFilter filter, CancellationToken cancellationToken) =>
        await repository.GetWeatherAsync(await ResolveAsync(filter, cancellationToken), cancellationToken);

    public Task<IncidentTrafficImpact> GetTrafficImpactAsync(CancellationToken cancellationToken) =>
        repository.GetTrafficImpactAsync(cancellationToken);

    /// <summary>Validates the filter and fills missing dates with the latest twelve months of data.</summary>
    private async Task<ResolvedIncidentFilter> ResolveAsync(IncidentFilter filter, CancellationToken cancellationToken)
    {
        IncidentRequestValidator.Validate(filter);
        if (filter.From is { } from && filter.To is { } to)
        {
            return new ResolvedIncidentFilter(from, to, filter.Category);
        }

        var metadata = await repository.GetMetadataAsync(cancellationToken);
        var last = filter.To ?? metadata.LastDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var first = filter.From ?? last.AddMonths(-IncidentRules.DefaultRangeMonths).AddDays(1);
        var resolved = new IncidentFilter(first, last, filter.Category);
        IncidentRequestValidator.Validate(resolved);
        return new ResolvedIncidentFilter(first, last, filter.Category);
    }
}
