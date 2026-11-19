using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Application.Contracts;

namespace IstanbulTraffic.Application.Services;

/// <summary>Long-term analyses across every loaded month.</summary>
public sealed class InsightsService(IInsightsRepository repository)
{
    private static readonly IReadOnlyDictionary<string, int> PeriodOrder = new Dictionary<string, int>
    {
        ["school_term"] = 0,
        ["school_break"] = 1,
        ["summer_break"] = 2,
        ["ramadan"] = 3,
    };

    public Task<IReadOnlyList<MonthlyInsight>> GetMonthlyAsync(CancellationToken cancellationToken) =>
        repository.GetMonthlyAsync(cancellationToken);

    public Task<IReadOnlyList<MonthHourCell>> GetMonthHourAsync(CancellationToken cancellationToken) =>
        repository.GetMonthHourAsync(cancellationToken);

    public Task<IReadOnlyList<DayOfWeekHourCell>> GetDayOfWeekHourAsync(CancellationToken cancellationToken) =>
        repository.GetDayOfWeekHourAsync(cancellationToken);

    public Task<IReadOnlyList<CalendarDay>> GetCalendarAsync(CancellationToken cancellationToken) =>
        repository.GetCalendarAsync(cancellationToken);

    /// <summary>Returns the profiles with the school term first, so it reads as the reference.</summary>
    public async Task<IReadOnlyList<PeriodProfilePoint>> GetPeriodProfilesAsync(CancellationToken cancellationToken)
    {
        var points = await repository.GetPeriodProfilesAsync(cancellationToken);
        return points
            .OrderBy(point => PeriodOrder.GetValueOrDefault(point.Period, int.MaxValue))
            .ThenBy(point => point.HourOfDay)
            .ToList();
    }

    public Task<IReadOnlyList<HolidayEffect>> GetHolidayEffectsAsync(CancellationToken cancellationToken) =>
        repository.GetHolidayEffectsAsync(cancellationToken);

    public Task<IReadOnlyList<ReliabilityPoint>> GetReliabilityAsync(CancellationToken cancellationToken) =>
        repository.GetReliabilityAsync(cancellationToken);

    public Task<LocationChangeReport> GetLocationChangesAsync(CancellationToken cancellationToken) =>
        repository.GetLocationChangesAsync(cancellationToken);

    public Task<WeatherReport> GetWeatherAsync(CancellationToken cancellationToken) =>
        repository.GetWeatherAsync(cancellationToken);
}
