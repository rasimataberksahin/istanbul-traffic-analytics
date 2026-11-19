using IstanbulTraffic.Domain.Traffic;

namespace IstanbulTraffic.Application.Contracts;

public sealed record TrafficFilter(DateOnly? From = null, DateOnly? To = null, DayType DayType = DayType.All);

public sealed record TrafficTotals
{
    public DateOnly? FirstDate { get; init; }

    public DateOnly? LastDate { get; init; }

    public long ObservationCount { get; init; }

    public int LocationCount { get; init; }

    public long VehicleObservations { get; init; }

    public decimal? WeightedAverageSpeedKmh { get; init; }

    public decimal? SimpleAverageSpeedKmh { get; init; }
}

public sealed record TrafficSummary(TrafficTotals Totals, HourlyProfilePoint? SlowestHour, HourlyProfilePoint? FastestHour);

public sealed record HourlyProfilePoint
{
    public int HourOfDay { get; init; }

    public long ObservationCount { get; init; }

    public long VehicleObservations { get; init; }

    public decimal WeightedAverageSpeedKmh { get; init; }
}

public sealed record DailyTrendPoint
{
    public DateOnly Date { get; init; }

    public string DayName { get; init; } = string.Empty;

    public bool HasPublicHoliday { get; init; }

    public long VehicleObservations { get; init; }

    public decimal WeightedAverageSpeedKmh { get; init; }
}

public sealed record SpeedHeatmapCell
{
    public DateOnly Date { get; init; }

    public int HourOfDay { get; init; }

    public decimal WeightedAverageSpeedKmh { get; init; }
}

public sealed record DayTypeComparisonPoint
{
    public int HourOfDay { get; init; }

    public decimal? WeekdaySpeedKmh { get; init; }

    public decimal? WeekendSpeedKmh { get; init; }

    public decimal? WeekendAdvantageKmh { get; init; }
}

public sealed record SpeedBandShare
{
    public int BandOrder { get; init; }

    public string SpeedBand { get; init; } = string.Empty;

    public long ObservationCount { get; init; }

    public long VehicleObservations { get; init; }

    public decimal VehicleSharePct { get; init; }
}

public sealed record DatasetMetadata
{
    public DateOnly? FirstDate { get; init; }

    public DateOnly? LastDate { get; init; }

    public int LocationCount { get; init; }

    public IReadOnlyList<DateOnly> LoadedMonths { get; init; } = [];

    public IReadOnlyList<DayType> DayTypes { get; init; } = Enum.GetValues<DayType>();
}
