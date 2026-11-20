namespace IstanbulTraffic.Domain.Incidents;

/// <summary>Categories and thresholds shared by every incident analysis.</summary>
public static class IncidentRules
{
    public const string Accident = "accident";
    public const string Breakdown = "breakdown";
    public const string VehicleFire = "vehicle_fire";
    public const string Roadworks = "roadworks";
    public const string Closure = "closure";
    public const string Congestion = "congestion";
    public const string Event = "event";
    public const string Weather = "weather";
    public const string Other = "other";

    /// <summary>Categories that describe something happening on the road. "other" holds ferry notices and news.</summary>
    public static readonly IReadOnlyList<string> RoadCategories =
        [Accident, Breakdown, VehicleFire, Roadworks, Closure, Congestion, Event, Weather];

    public static readonly IReadOnlySet<string> AllCategories = new HashSet<string>(RoadCategories) { Other };

    /// <summary>Accidents with injuries, a pile-up or a death.</summary>
    public static readonly IReadOnlyList<string> SevereAccidents = ["injury", "chain", "fatal"];

    /// <summary>Default view: the latest twelve months of announcements.</summary>
    public const int DefaultRangeMonths = 12;

    /// <summary>The whole published history fits, so long-term questions need no workaround.</summary>
    public const int MaximumRangeDays = 366 * 15;

    public const int DefaultRoadLimit = 20;
    public const int LatestIncidentsPerCell = 8;

    /// <summary>Newest announcements across the city, for the incident feed.</summary>
    public const int DefaultLatestLimit = 12;

    /// <summary>A road segment needs this many incidents in the period to be ranked.</summary>
    public const int MinimumSegmentIncidents = 5;
}
