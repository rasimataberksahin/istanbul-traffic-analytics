using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Application.Services;
using IstanbulTraffic.Domain.Incidents;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace IstanbulTraffic.Api.Controllers;

public class IncidentQuery
{
    /// <summary>First day to include (yyyy-MM-dd). Defaults to twelve months before the last incident.</summary>
    public DateOnly? From { get; init; }

    /// <summary>Last day to include (yyyy-MM-dd). Defaults to the day of the last incident.</summary>
    public DateOnly? To { get; init; }

    /// <summary>accident, breakdown, vehicle_fire, roadworks, closure, congestion, event, weather or other.</summary>
    public string? Category { get; init; }

    public IncidentFilter ToFilter() => new(From, To, string.IsNullOrWhiteSpace(Category) ? null : Category.Trim().ToLowerInvariant());
}

public sealed class IncidentRoadsQuery : IncidentQuery
{
    public int Limit { get; init; } = IncidentRules.DefaultRoadLimit;
}

/// <summary>Traffic incidents announced by the IBB Traffic Management Centre since 2013.</summary>
[ApiController]
[Route("api/v1/incidents")]
[OutputCache(PolicyName = ApiPolicies.AnalyticsCache)]
[ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
public sealed class IncidentsController(IncidentsService service) : ControllerBase
{
    /// <summary>Covered period, number of incidents and the time of the last load.</summary>
    [HttpGet("metadata")]
    public Task<IncidentMetadata> GetMetadata(CancellationToken cancellationToken) => service.GetMetadataAsync(cancellationToken);

    /// <summary>Counts and median durations by category, accident severity and last year's counts.</summary>
    [HttpGet("summary")]
    public Task<IncidentSummary> GetSummary([FromQuery] IncidentQuery query, CancellationToken cancellationToken) =>
        service.GetSummaryAsync(query.ToFilter(), cancellationToken);

    /// <summary>Incidents per month and category over the whole history.</summary>
    [HttpGet("monthly")]
    public Task<IReadOnlyList<IncidentMonth>> GetMonthly(CancellationToken cancellationToken) => service.GetMonthlyAsync(cancellationToken);

    /// <summary>Incidents by day of week and hour.</summary>
    [HttpGet("week-hour")]
    public Task<IReadOnlyList<IncidentWeekHour>> GetWeekHour([FromQuery] IncidentQuery query, CancellationToken cancellationToken) =>
        service.GetWeekHourAsync(query.ToFilter(), cancellationToken);

    /// <summary>Incidents per geohash cell, for the map.</summary>
    [HttpGet("cells")]
    public Task<IReadOnlyList<IncidentCell>> GetCells([FromQuery] IncidentQuery query, CancellationToken cancellationToken) =>
        service.GetCellsAsync(query.ToFilter(), cancellationToken);

    /// <summary>One cell: categories, hours, busiest road segments and the latest incidents.</summary>
    [HttpGet("cells/{geohash}")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<IncidentCellDetail> GetCell(string geohash, [FromQuery] IncidentQuery query, CancellationToken cancellationToken) =>
        service.GetCellDetailAsync(geohash, query.ToFilter(), cancellationToken);

    /// <summary>Incidents by road and the road segments with the most incidents.</summary>
    [HttpGet("roads")]
    public Task<IncidentRoads> GetRoads([FromQuery] IncidentRoadsQuery query, CancellationToken cancellationToken) =>
        service.GetRoadsAsync(query.ToFilter(), query.Limit, cancellationToken);

    /// <summary>How long incidents last and how fast teams arrive, by category and by year.</summary>
    [HttpGet("durations")]
    public Task<IncidentDurations> GetDurations([FromQuery] IncidentQuery query, CancellationToken cancellationToken) =>
        service.GetDurationsAsync(query.ToFilter(), cancellationToken);

    /// <summary>Accident rate in rain and snow against dry hours of the same month and hour.</summary>
    [HttpGet("weather")]
    public Task<IReadOnlyList<IncidentWeatherEffect>> GetWeather([FromQuery] IncidentQuery query, CancellationToken cancellationToken) =>
        service.GetWeatherAsync(query.ToFilter(), cancellationToken);

    /// <summary>Speed in the incident's cell around the incident, and what lies behind the slowest evenings.</summary>
    [HttpGet("traffic-impact")]
    public Task<IncidentTrafficImpact> GetTrafficImpact(CancellationToken cancellationToken) => service.GetTrafficImpactAsync(cancellationToken);
}
