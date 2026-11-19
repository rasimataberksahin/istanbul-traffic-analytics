using IstanbulTraffic.Domain.Traffic;

namespace IstanbulTraffic.Application.Contracts;

public sealed record SlowestLocationsRequest(
    TrafficFilter Filter,
    int StartHour = TrafficRules.EveningPeakStartHour,
    int EndHour = TrafficRules.EveningPeakEndHour,
    int Limit = TrafficRules.DefaultLocationLimit);

public sealed record SlowestLocation
{
    public int Rank { get; init; }

    public string Geohash { get; init; } = string.Empty;

    public decimal Latitude { get; init; }

    public decimal Longitude { get; init; }

    public long ObservedHours { get; init; }

    public decimal AverageVehicleCount { get; init; }

    public decimal WeightedAverageSpeedKmh { get; init; }
}

public sealed record CongestionPoint
{
    public string Geohash { get; init; } = string.Empty;

    public decimal Latitude { get; init; }

    public decimal Longitude { get; init; }

    public decimal AveragePeakVehicleCount { get; init; }

    public decimal FreeFlowSpeedKmh { get; init; }

    public decimal PeakSpeedKmh { get; init; }

    public decimal CongestionIndex { get; init; }
}

public sealed record LocationDetails
{
    public string Geohash { get; init; } = string.Empty;

    public decimal Latitude { get; init; }

    public decimal Longitude { get; init; }

    public long ObservationCount { get; init; }

    public double? VehicleSpeedCorrelation { get; init; }
}

public sealed record LocationProfile(LocationDetails Location, IReadOnlyList<HourlyProfilePoint> HourlyProfile);
