namespace IstanbulTraffic.Application.Contracts;

/// <summary>City indicators of one loaded month.</summary>
public sealed record MonthlyInsight
{
    public DateOnly Month { get; init; }

    public int DaysInMonth { get; init; }

    public int ObservedHours { get; init; }

    public int PartialHours { get; init; }

    public decimal CoveragePct { get; init; }

    public long RowCount { get; init; }

    public int LocationCount { get; init; }

    public long VehicleObservations { get; init; }

    /// <summary>Vehicles per cell and hour. Unlike totals, it stays comparable when fewer cells report in an hour.</summary>
    public decimal AverageVehicleCount { get; init; }

    public decimal? WeightedAverageSpeedKmh { get; init; }

    public decimal? MorningPeakSpeedKmh { get; init; }

    public decimal? EveningPeakSpeedKmh { get; init; }

    public decimal? NightSpeedKmh { get; init; }

    public decimal? CongestionIndex { get; init; }

    /// <summary>Average number of weekday hours in which the city runs below the congested speed ratio.</summary>
    public decimal? CongestedHoursPerWeekday { get; init; }
}

public sealed record MonthHourCell
{
    public DateOnly Month { get; init; }

    public int HourOfDay { get; init; }

    public decimal? WeightedAverageSpeedKmh { get; init; }
}

public sealed record DayOfWeekHourCell
{
    public int IsoDayOfWeek { get; init; }

    public string DayName { get; init; } = string.Empty;

    public int HourOfDay { get; init; }

    public decimal? WeightedAverageSpeedKmh { get; init; }

    public decimal AverageVehicleCount { get; init; }
}

public sealed record CalendarDay
{
    public DateOnly Date { get; init; }

    public string DayName { get; init; } = string.Empty;

    public bool IsWeekend { get; init; }

    public bool HasPublicHoliday { get; init; }

    public int ObservedHours { get; init; }

    public long VehicleObservations { get; init; }

    public decimal? WeightedAverageSpeedKmh { get; init; }

    public decimal? EveningSpeedKmh { get; init; }

    public string? Periods { get; init; }
}

/// <summary>Weekday profile of a calendar period such as Ramadan or the summer break.</summary>
public sealed record PeriodProfilePoint
{
    public string Period { get; init; } = string.Empty;

    public int Days { get; init; }

    public int HourOfDay { get; init; }

    public decimal? WeightedAverageSpeedKmh { get; init; }

    public decimal AverageVehicleCount { get; init; }
}

public sealed record HolidayEffect
{
    public string Code { get; init; } = string.Empty;

    public string Name { get; init; } = string.Empty;

    public DateOnly StartDate { get; init; }

    public DateOnly EndDate { get; init; }

    public int Days { get; init; }

    public decimal? HolidaySpeedKmh { get; init; }

    public decimal? BaselineSpeedKmh { get; init; }

    public decimal? SpeedChangeKmh { get; init; }

    public decimal? VolumeChangePct { get; init; }
}

/// <summary>Spread of the daily city speed at one weekday hour.</summary>
public sealed record ReliabilityPoint
{
    public int HourOfDay { get; init; }

    public int Days { get; init; }

    public decimal P10SpeedKmh { get; init; }

    public decimal P25SpeedKmh { get; init; }

    public decimal MedianSpeedKmh { get; init; }

    public decimal P75SpeedKmh { get; init; }

    public decimal P90SpeedKmh { get; init; }
}

public sealed record LocationChange
{
    public string Geohash { get; init; } = string.Empty;

    /// <summary>OpenStreetMap neighbourhood (mahalle) of the cell centre, when known.</summary>
    public string? Neighborhood { get; init; }

    /// <summary>OpenStreetMap district (ilçe) of the cell centre, when known.</summary>
    public string? District { get; init; }

    public decimal Latitude { get; init; }

    public decimal Longitude { get; init; }

    public decimal PreviousPeakSpeedKmh { get; init; }

    public decimal CurrentPeakSpeedKmh { get; init; }

    public decimal SpeedChangeKmh { get; init; }

    public decimal? PeakVolumeChangePct { get; init; }
}

/// <summary>Weekday evening peak of each location, latest twelve months against the twelve before.</summary>
public sealed record LocationChangeReport(
    DateOnly? CurrentFrom,
    DateOnly? CurrentTo,
    DateOnly? PreviousFrom,
    DateOnly? PreviousTo,
    IReadOnlyList<LocationChange> Locations);
