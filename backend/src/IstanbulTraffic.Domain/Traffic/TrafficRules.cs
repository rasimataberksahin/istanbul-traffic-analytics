namespace IstanbulTraffic.Domain.Traffic;

public enum DayType
{
    All,
    Weekday,
    Weekend,
    Holiday,
}

/// <summary>Analytical rules shared by every traffic query.</summary>
public static class TrafficRules
{
    public const int GeohashLength = 6;
    public const int MaximumDateRangeDays = 366;
    public const int DefaultLocationLimit = 15;
    public const int MaximumLocationLimit = 100;
    public const int MinimumLocationObservations = 30;
    public const int NightStartHour = 1;
    public const int NightEndHour = 4;
    public const int EveningPeakStartHour = 17;
    public const int EveningPeakEndHour = 19;
    public const int MorningPeakStartHour = 7;
    public const int MorningPeakEndHour = 9;
    public const int DaytimeStartHour = 7;
    public const int DaytimeEndHour = 21;

    /// <summary>A weekday hour is congested when the city runs below this share of its night speed.</summary>
    public const decimal CongestedSpeedRatio = 0.75m;

    /// <summary>Minimum observed hours of a weekday for its congested hours to be counted.</summary>
    public const int MinimumHoursPerDay = 20;

    /// <summary>Days before and after a holiday that form its same-weekday baseline.</summary>
    public const int HolidayBaselineDays = 21;

    public const int ComparisonWindowMonths = 12;
    public const int MinimumComparisonPeakHours = 60;

    /// <summary>
    /// A location is compared only when each window has at least this share of the
    /// peak hours of the best-covered location, so sparse cells cannot dominate the ranking.
    /// </summary>
    public const decimal MinimumComparisonCoverage = 0.5m;
}
