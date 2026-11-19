using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Application.Services;
using IstanbulTraffic.Domain.Traffic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace IstanbulTraffic.Api.Controllers;

public class TrafficQuery
{
    /// <summary>First day to include (yyyy-MM-dd).</summary>
    public DateOnly? From { get; init; }

    /// <summary>Last day to include (yyyy-MM-dd).</summary>
    public DateOnly? To { get; init; }

    public DayType DayType { get; init; } = DayType.All;

    public TrafficFilter ToFilter() => new(From, To, DayType);
}

public sealed class SlowestLocationsQuery : TrafficQuery
{
    public int StartHour { get; init; } = TrafficRules.EveningPeakStartHour;

    public int EndHour { get; init; } = TrafficRules.EveningPeakEndHour;

    public int Limit { get; init; } = TrafficRules.DefaultLocationLimit;
}

[ApiController]
[Route("api/v1/traffic")]
[OutputCache(PolicyName = ApiPolicies.AnalyticsCache)]
[ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
public sealed class TrafficController(TrafficAnalyticsService service) : ControllerBase
{
    [HttpGet("summary")]
    public Task<TrafficSummary> GetSummary([FromQuery] TrafficQuery query, CancellationToken cancellationToken) =>
        service.GetSummaryAsync(query.ToFilter(), cancellationToken);

    [HttpGet("hourly-profile")]
    public Task<IReadOnlyList<HourlyProfilePoint>> GetHourlyProfile([FromQuery] TrafficQuery query, CancellationToken cancellationToken) =>
        service.GetHourlyProfileAsync(query.ToFilter(), cancellationToken);

    [HttpGet("daily-trend")]
    public Task<IReadOnlyList<DailyTrendPoint>> GetDailyTrend([FromQuery] TrafficQuery query, CancellationToken cancellationToken) =>
        service.GetDailyTrendAsync(query.ToFilter(), cancellationToken);

    [HttpGet("heatmap")]
    public Task<IReadOnlyList<SpeedHeatmapCell>> GetHeatmap([FromQuery] TrafficQuery query, CancellationToken cancellationToken) =>
        service.GetHeatmapAsync(query.ToFilter(), cancellationToken);

    [HttpGet("day-type-comparison")]
    public Task<IReadOnlyList<DayTypeComparisonPoint>> GetDayTypeComparison([FromQuery] TrafficQuery query, CancellationToken cancellationToken) =>
        service.GetDayTypeComparisonAsync(query.ToFilter(), cancellationToken);

    [HttpGet("speed-bands")]
    public Task<IReadOnlyList<SpeedBandShare>> GetSpeedBands([FromQuery] TrafficQuery query, CancellationToken cancellationToken) =>
        service.GetSpeedBandsAsync(query.ToFilter(), cancellationToken);
}

[ApiController]
[Route("api/v1/locations")]
[OutputCache(PolicyName = ApiPolicies.AnalyticsCache)]
[ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
public sealed class LocationsController(LocationAnalyticsService service) : ControllerBase
{
    [HttpGet("slowest")]
    public Task<IReadOnlyList<SlowestLocation>> GetSlowest([FromQuery] SlowestLocationsQuery query, CancellationToken cancellationToken) =>
        service.GetSlowestAsync(
            new SlowestLocationsRequest(query.ToFilter(), query.StartHour, query.EndHour, query.Limit),
            cancellationToken);

    [HttpGet("congestion-map")]
    public Task<IReadOnlyList<CongestionPoint>> GetCongestionMap([FromQuery] TrafficQuery query, CancellationToken cancellationToken) =>
        service.GetCongestionMapAsync(query.ToFilter(), cancellationToken);

    [HttpGet("{geohash}/profile")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<LocationProfile> GetProfile(string geohash, [FromQuery] TrafficQuery query, CancellationToken cancellationToken) =>
        service.GetProfileAsync(geohash, query.ToFilter(), cancellationToken);
}

[ApiController]
[Route("api/v1/metadata")]
[OutputCache(PolicyName = ApiPolicies.AnalyticsCache)]
public sealed class MetadataController(TrafficAnalyticsService service) : ControllerBase
{
    [HttpGet]
    public Task<DatasetMetadata> Get(CancellationToken cancellationToken) => service.GetMetadataAsync(cancellationToken);
}
