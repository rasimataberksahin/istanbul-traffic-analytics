using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Application.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace IstanbulTraffic.Api.Controllers;

/// <summary>Long-term analyses over every loaded month, served from the aggregate layer.</summary>
[ApiController]
[Route("api/v1/insights")]
[OutputCache(PolicyName = ApiPolicies.AnalyticsCache)]
public sealed class InsightsController(InsightsService service) : ControllerBase
{
    /// <summary>Speed, congestion, volume and data coverage of each month.</summary>
    [HttpGet("monthly")]
    public Task<IReadOnlyList<MonthlyInsight>> GetMonthly(CancellationToken cancellationToken) =>
        service.GetMonthlyAsync(cancellationToken);

    /// <summary>Weekday speed of each month and hour.</summary>
    [HttpGet("month-hour")]
    public Task<IReadOnlyList<MonthHourCell>> GetMonthHour(CancellationToken cancellationToken) =>
        service.GetMonthHourAsync(cancellationToken);

    /// <summary>Speed and volume of each day of week and hour, holidays excluded.</summary>
    [HttpGet("day-of-week")]
    public Task<IReadOnlyList<DayOfWeekHourCell>> GetDayOfWeek(CancellationToken cancellationToken) =>
        service.GetDayOfWeekHourAsync(cancellationToken);

    /// <summary>One row per day with its calendar periods.</summary>
    [HttpGet("calendar")]
    public Task<IReadOnlyList<CalendarDay>> GetCalendar(CancellationToken cancellationToken) =>
        service.GetCalendarAsync(cancellationToken);

    /// <summary>Weekday hourly profiles of the school term, school breaks, summer break and Ramadan.</summary>
    [HttpGet("periods")]
    public Task<IReadOnlyList<PeriodProfilePoint>> GetPeriods(CancellationToken cancellationToken) =>
        service.GetPeriodProfilesAsync(cancellationToken);

    /// <summary>Daytime speed and volume of each public holiday against the same weekdays around it.</summary>
    [HttpGet("holidays")]
    public Task<IReadOnlyList<HolidayEffect>> GetHolidays(CancellationToken cancellationToken) =>
        service.GetHolidayEffectsAsync(cancellationToken);

    /// <summary>Percentiles of the daily city speed at each weekday hour.</summary>
    [HttpGet("reliability")]
    public Task<IReadOnlyList<ReliabilityPoint>> GetReliability(CancellationToken cancellationToken) =>
        service.GetReliabilityAsync(cancellationToken);

    /// <summary>Evening peak speed change of each location, latest twelve months against the twelve before.</summary>
    [HttpGet("location-changes")]
    public Task<LocationChangeReport> GetLocationChanges(CancellationToken cancellationToken) =>
        service.GetLocationChangesAsync(cancellationToken);

    /// <summary>Effect of rain and snow on speed and volume, by condition, hour and district.</summary>
    [HttpGet("weather")]
    public Task<WeatherReport> GetWeather(CancellationToken cancellationToken) =>
        service.GetWeatherAsync(cancellationToken);
}
