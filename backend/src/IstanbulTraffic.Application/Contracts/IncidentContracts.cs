namespace IstanbulTraffic.Application.Contracts;

/// <summary>Date range and optional category. Missing dates default to the latest twelve months.</summary>
public sealed record IncidentFilter(DateOnly? From = null, DateOnly? To = null, string? Category = null);

/// <summary>A filter with both dates resolved.</summary>
public sealed record ResolvedIncidentFilter(DateOnly From, DateOnly To, string? Category);

public sealed record IncidentMetadata
{
    public DateOnly? FirstDate { get; init; }

    public DateOnly? LastDate { get; init; }

    public long IncidentCount { get; init; }

    public DateTimeOffset? LoadedAt { get; init; }

    public string? SourceFile { get; init; }

    /// <summary>First and last day of the hourly traffic data, where incidents and speeds overlap.</summary>
    public DateOnly? TrafficFirstDate { get; init; }

    public DateOnly? TrafficLastDate { get; init; }
}

public sealed record CategoryCount
{
    public string Category { get; init; } = string.Empty;

    public int Incidents { get; init; }

    public decimal? MedianDurationMin { get; init; }

    public decimal? MedianResponseMin { get; init; }

    /// <summary>Same category over the same dates one year earlier.</summary>
    public int? PreviousYearIncidents { get; init; }
}

public sealed record SeverityCount
{
    public string Severity { get; init; } = string.Empty;

    public int Incidents { get; init; }
}

public sealed record IncidentSummary(
    ResolvedIncidentFilter Filter,
    int Days,
    IReadOnlyList<CategoryCount> Categories,
    IReadOnlyList<SeverityCount> AccidentSeverity,
    decimal? ClosedLaneSharePct);

public sealed record IncidentMonth
{
    public DateOnly Month { get; init; }

    public string Category { get; init; } = string.Empty;

    public int Incidents { get; init; }

    public int SevereAccidents { get; init; }
}

public sealed record IncidentWeekHour
{
    public int IsoDayOfWeek { get; init; }

    public int HourOfDay { get; init; }

    public int Incidents { get; init; }
}

public sealed record IncidentCell
{
    public string Geohash { get; init; } = string.Empty;

    public double Latitude { get; init; }

    public double Longitude { get; init; }

    public string? Neighborhood { get; init; }

    public string? District { get; init; }

    public int Incidents { get; init; }

    public int Accidents { get; init; }

    public int SevereAccidents { get; init; }

    public int Breakdowns { get; init; }

    public int Roadworks { get; init; }

    public decimal? MedianDurationMin { get; init; }
}

public sealed record IncidentItem
{
    public long IncidentId { get; init; }

    public DateTime StartedAt { get; init; }

    public string Category { get; init; } = string.Empty;

    public string? Severity { get; init; }

    public string Title { get; init; } = string.Empty;

    public decimal? DurationMin { get; init; }

    public int? ClosedLanes { get; init; }
}

public sealed record IncidentCellDetail(
    IncidentCell Cell,
    IReadOnlyList<CategoryCount> Categories,
    IReadOnlyList<int> Hourly,
    IReadOnlyList<RoadSegment> Segments,
    IReadOnlyList<IncidentItem> Latest);

public sealed record RoadSegment
{
    public string Road { get; init; } = string.Empty;

    public string? Segment { get; init; }

    public int Incidents { get; init; }

    public int Accidents { get; init; }

    public int SevereAccidents { get; init; }

    public int Breakdowns { get; init; }

    public decimal? MedianDurationMin { get; init; }

    /// <summary>Mean position of the segment's incidents, for jumping to it on the map.</summary>
    public string? Geohash { get; init; }
}

public sealed record RoadTotal
{
    public string Road { get; init; } = string.Empty;

    public int Incidents { get; init; }

    public int Accidents { get; init; }

    public int SevereAccidents { get; init; }
}

public sealed record IncidentRoads(IReadOnlyList<RoadTotal> Roads, IReadOnlyList<RoadSegment> Segments);

public sealed record DurationStats
{
    public string Category { get; init; } = string.Empty;

    public int Incidents { get; init; }

    public decimal? MedianDurationMin { get; init; }

    public decimal? P75DurationMin { get; init; }

    public decimal? P90DurationMin { get; init; }

    public decimal? MedianResponseMin { get; init; }

    /// <summary>Incidents with an arrival time logged before the closure; the rest have no response time.</summary>
    public int ResponseCount { get; init; }
}

public sealed record YearlyDuration
{
    public int Year { get; init; }

    public int Accidents { get; init; }

    public decimal? MedianDurationMin { get; init; }

    public decimal? MedianResponseMin { get; init; }

    public int ResponseCount { get; init; }
}

public sealed record IncidentDurations(IReadOnlyList<DurationStats> Categories, IReadOnlyList<YearlyDuration> Yearly);

/// <summary>
/// Accidents per hour in each weather condition against the dry hours of the same month and hour,
/// so rush hours and seasons do not bias the ratio.
/// </summary>
public sealed record IncidentWeatherEffect
{
    public string Condition { get; init; } = string.Empty;

    public int Hours { get; init; }

    public int Accidents { get; init; }

    public decimal? ExpectedAccidents { get; init; }

    /// <summary>Observed / expected accidents; 1.5 means 50 % more accidents than in dry weather.</summary>
    public decimal? RateRatio { get; init; }

    public decimal? SevereRateRatio { get; init; }
}

public sealed record ImpactPoint
{
    /// <summary>accident_damage, accident_injury, accident_chain, accident_fatal, breakdown or vehicle_fire.</summary>
    public string Group { get; init; } = string.Empty;

    public int OffsetHours { get; init; }

    public int Incidents { get; init; }

    public decimal SpeedChangeKmh { get; init; }

    public decimal SpeedChangePct { get; init; }
}

public sealed record LaneImpact
{
    public int? ClosedLanes { get; init; }

    public int Accidents { get; init; }

    public decimal SpeedChangeKmh { get; init; }
}

public sealed record SlowEvening
{
    public DateOnly Date { get; init; }

    public string DayName { get; init; } = string.Empty;

    public decimal EveningSpeedKmh { get; init; }

    /// <summary>Against the weekday evenings of the same month.</summary>
    public decimal SpeedChangeKmh { get; init; }

    public int Accidents { get; init; }

    public int SevereAccidents { get; init; }

    public decimal? RainMm { get; init; }

    public string? LargestIncident { get; init; }
}

public sealed record EveningExplanation
{
    public int Evenings { get; init; }

    public decimal SlowWithRainPct { get; init; }

    public decimal SlowWithSevereAccidentPct { get; init; }

    public decimal AllWithRainPct { get; init; }

    public decimal AllWithSevereAccidentPct { get; init; }
}

public sealed record IncidentTrafficImpact(
    DateOnly? From,
    DateOnly? To,
    int MatchedIncidents,
    IReadOnlyList<ImpactPoint> Recovery,
    IReadOnlyList<LaneImpact> Lanes,
    IReadOnlyList<SlowEvening> SlowestEvenings,
    EveningExplanation? Explanation);
