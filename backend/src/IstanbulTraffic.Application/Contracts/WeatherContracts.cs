namespace IstanbulTraffic.Application.Contracts;

/// <summary>
/// How rain and snow change traffic. Every wet hour is compared with the dry weekday hours of the
/// same month and hour of day, so season, time of day and the vehicle counting level cancel out.
/// </summary>
public sealed record WeatherReport(
    IReadOnlyList<WeatherCondition> Conditions,
    IReadOnlyList<WeatherHourEffect> Hourly,
    IReadOnlyList<DistrictRainEffect> Districts,
    IReadOnlyList<WetEvening> WettestEvenings);

public sealed record WeatherCondition
{
    /// <summary>dry, light_rain, heavy_rain or snow.</summary>
    public string Condition { get; init; } = string.Empty;

    public int Hours { get; init; }

    public int EveningHours { get; init; }

    public decimal? AverageSpeedKmh { get; init; }

    /// <summary>Mean difference from dry hours of the same month and hour.</summary>
    public decimal? SpeedChangeKmh { get; init; }

    public decimal? EveningSpeedChangeKmh { get; init; }

    /// <summary>Vehicles per cell and hour against the same dry baseline.</summary>
    public decimal? VolumeChangePct { get; init; }
}

public sealed record WeatherHourEffect
{
    public int HourOfDay { get; init; }

    /// <summary>Weekday hours with at least light rain at this hour.</summary>
    public int RainHours { get; init; }

    public decimal? SpeedChangeKmh { get; init; }
}

public sealed record DistrictRainEffect
{
    public string District { get; init; } = string.Empty;

    public int Cells { get; init; }

    /// <summary>Evening peak speed on wet weekday evenings minus dry ones, month by month, weighted by dry-evening vehicles.</summary>
    public decimal SpeedChangeKmh { get; init; }
}

public sealed record WetEvening
{
    public DateOnly Date { get; init; }

    public string DayName { get; init; } = string.Empty;

    /// <summary>City-mean rain between 17:00 and 19:59.</summary>
    public decimal PrecipitationMm { get; init; }

    public decimal? SnowfallCm { get; init; }

    public decimal? EveningSpeedKmh { get; init; }

    /// <summary>Against the dry weekday evenings of the same month.</summary>
    public decimal? SpeedChangeKmh { get; init; }
}
