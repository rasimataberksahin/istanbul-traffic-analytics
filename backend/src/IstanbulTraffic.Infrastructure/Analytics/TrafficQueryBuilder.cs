using System.Data;
using Dapper;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Domain.Traffic;

namespace IstanbulTraffic.Infrastructure.Analytics;

/// <summary>Builds parameterized filters that keep PostgreSQL partition pruning effective.</summary>
internal static class TrafficQueryBuilder
{
    /// <summary>Filter for <c>traffic.fact_traffic_hourly</c> aliased as <c>f</c>.</summary>
    public static (string Where, DynamicParameters Parameters) Build(TrafficFilter filter) =>
        Build(filter, "f.is_analysis_eligible");

    /// <summary>Filter for <c>traffic.agg_city_hourly</c> aliased as <c>f</c>. Hours without eligible rows are skipped.</summary>
    public static (string Where, DynamicParameters Parameters) BuildForCityHours(TrafficFilter filter) =>
        Build(filter, "f.vehicle_count > 0");

    /// <summary>Filter for <c>traffic.agg_location_daily</c> aliased as <c>d</c>.</summary>
    public static (string Where, DynamicParameters Parameters) BuildForLocationDays(TrafficFilter filter)
    {
        var clauses = new List<string>
        {
            filter.DayType switch
            {
                DayType.All => "d.observed_hours > 0",
                DayType.Weekday => "d.weekday_hours > 0",
                DayType.Weekend => "d.weekend_hours > 0",
                DayType.Holiday => "d.holiday_hours > 0",
                _ => throw new ArgumentOutOfRangeException(nameof(filter), filter.DayType, "Unknown day type."),
            },
        };
        var parameters = new DynamicParameters();

        if (filter.From is { } from)
        {
            clauses.Add("d.date_key >= @FromDate");
            parameters.Add("FromDate", from, DbType.Date);
        }

        if (filter.To is { } to)
        {
            clauses.Add("d.date_key <= @ToDate");
            parameters.Add("ToDate", to, DbType.Date);
        }

        return (string.Join(" AND ", clauses), parameters);
    }

    private static (string Where, DynamicParameters Parameters) Build(TrafficFilter filter, string baseClause)
    {
        var clauses = new List<string> { baseClause };
        var parameters = new DynamicParameters();

        if (filter.From is { } from)
        {
            clauses.Add("f.observed_at >= @From");
            parameters.Add("From", from.ToDateTime(TimeOnly.MinValue), DbType.DateTime2);
        }

        if (filter.To is { } to)
        {
            clauses.Add("f.observed_at < @ToExclusive");
            parameters.Add("ToExclusive", to.AddDays(1).ToDateTime(TimeOnly.MinValue), DbType.DateTime2);
        }

        var dayTypeClause = DayTypeClause(filter.DayType);
        if (dayTypeClause is not null)
        {
            clauses.Add(dayTypeClause);
        }

        return (string.Join(" AND ", clauses), parameters);
    }

    internal static string? DayTypeClause(DayType dayType) => dayType switch
    {
        DayType.All => null,
        DayType.Weekday => "NOT f.is_weekend AND NOT f.is_public_holiday",
        DayType.Weekend => "f.is_weekend AND NOT f.is_public_holiday",
        DayType.Holiday => "f.is_public_holiday",
        _ => throw new ArgumentOutOfRangeException(nameof(dayType), dayType, "Unknown day type."),
    };
}

internal sealed class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override DateOnly Parse(object value) => value switch
    {
        DateOnly date => date,
        DateTime dateTime => DateOnly.FromDateTime(dateTime),
        _ => throw new DataException($"Cannot convert {value.GetType()} to DateOnly."),
    };

    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        parameter.DbType = DbType.Date;
        parameter.Value = value;
    }
}
