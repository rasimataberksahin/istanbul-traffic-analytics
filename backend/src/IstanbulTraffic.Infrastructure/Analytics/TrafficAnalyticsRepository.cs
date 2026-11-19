using Dapper;
using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Domain.Traffic;
using Npgsql;

namespace IstanbulTraffic.Infrastructure.Analytics;

/// <summary>
/// City-wide analytics. Every query reads the hourly aggregate layer, which the ETL
/// refreshes together with the facts, so a year of data is summarized in milliseconds.
/// </summary>
internal sealed class TrafficAnalyticsRepository(NpgsqlDataSource dataSource) : ITrafficAnalyticsRepository
{
    private const string WeightedSpeed = "ROUND(SUM(f.speed_volume)::numeric / NULLIF(SUM(f.vehicle_count), 0), 2)";

    public async Task<TrafficTotals> GetTotalsAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        var (where, parameters) = TrafficQueryBuilder.BuildForCityHours(filter);
        var (locationWhere, locationParameters) = TrafficQueryBuilder.BuildForLocationDays(filter);
        parameters.AddDynamicParams(locationParameters);

        var sql = $"""
            SELECT
                MIN(f.date_key)                             AS first_date,
                MAX(f.date_key)                             AS last_date,
                COALESCE(SUM(f.eligible_row_count), 0)::bigint AS observation_count,
                (
                    SELECT COUNT(DISTINCT d.location_id)::int
                    FROM traffic.agg_location_daily AS d
                    WHERE {locationWhere}
                )                                           AS location_count,
                COALESCE(SUM(f.vehicle_count), 0)::bigint   AS vehicle_observations,
                {WeightedSpeed}                             AS weighted_average_speed_kmh,
                ROUND(SUM(f.avg_speed_sum)::numeric / NULLIF(SUM(f.eligible_row_count), 0), 2) AS simple_average_speed_kmh
            FROM traffic.agg_city_hourly AS f
            WHERE {where}
            """;

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        return await connection.QuerySingleAsync<TrafficTotals>(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
    }

    public Task<IReadOnlyList<HourlyProfilePoint>> GetHourlyProfileAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        var (where, parameters) = TrafficQueryBuilder.BuildForCityHours(filter);
        var sql = $"""
            SELECT
                f.hour_of_day::int                   AS hour_of_day,
                SUM(f.eligible_row_count)::bigint    AS observation_count,
                SUM(f.vehicle_count)::bigint         AS vehicle_observations,
                {WeightedSpeed}                      AS weighted_average_speed_kmh
            FROM traffic.agg_city_hourly AS f
            WHERE {where}
            GROUP BY f.hour_of_day
            ORDER BY f.hour_of_day
            """;
        return QueryAsync<HourlyProfilePoint>(sql, parameters, cancellationToken);
    }

    public Task<IReadOnlyList<DailyTrendPoint>> GetDailyTrendAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        var (where, parameters) = TrafficQueryBuilder.BuildForCityHours(filter);
        var sql = $"""
            SELECT
                d.date_key                     AS date,
                d.day_name,
                BOOL_OR(f.is_public_holiday)   AS has_public_holiday,
                SUM(f.vehicle_count)::bigint   AS vehicle_observations,
                {WeightedSpeed}                AS weighted_average_speed_kmh
            FROM traffic.agg_city_hourly AS f
            JOIN traffic.dim_date AS d USING (date_key)
            WHERE {where}
            GROUP BY d.date_key, d.day_name
            ORDER BY d.date_key
            """;
        return QueryAsync<DailyTrendPoint>(sql, parameters, cancellationToken);
    }

    public Task<IReadOnlyList<SpeedHeatmapCell>> GetHeatmapAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        var (where, parameters) = TrafficQueryBuilder.BuildForCityHours(filter);
        var sql = $"""
            SELECT
                f.date_key         AS date,
                f.hour_of_day::int AS hour_of_day,
                {WeightedSpeed}    AS weighted_average_speed_kmh
            FROM traffic.agg_city_hourly AS f
            WHERE {where}
            GROUP BY f.date_key, f.hour_of_day
            ORDER BY f.date_key, f.hour_of_day
            """;
        return QueryAsync<SpeedHeatmapCell>(sql, parameters, cancellationToken);
    }

    public Task<IReadOnlyList<DayTypeComparisonPoint>> GetDayTypeComparisonAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        var (where, parameters) = TrafficQueryBuilder.BuildForCityHours(filter with { DayType = DayType.All });
        var sql = $"""
            WITH by_hour AS (
                SELECT
                    f.hour_of_day::int AS hour_of_day,
                    ROUND(
                        SUM(f.speed_volume) FILTER (WHERE NOT f.is_weekend)::numeric
                        / NULLIF(SUM(f.vehicle_count) FILTER (WHERE NOT f.is_weekend), 0), 2
                    ) AS weekday_speed_kmh,
                    ROUND(
                        SUM(f.speed_volume) FILTER (WHERE f.is_weekend)::numeric
                        / NULLIF(SUM(f.vehicle_count) FILTER (WHERE f.is_weekend), 0), 2
                    ) AS weekend_speed_kmh
                FROM traffic.agg_city_hourly AS f
                WHERE {where} AND NOT f.is_public_holiday
                GROUP BY f.hour_of_day
            )
            SELECT
                hour_of_day,
                weekday_speed_kmh,
                weekend_speed_kmh,
                weekend_speed_kmh - weekday_speed_kmh AS weekend_advantage_kmh
            FROM by_hour
            ORDER BY hour_of_day
            """;
        return QueryAsync<DayTypeComparisonPoint>(sql, parameters, cancellationToken);
    }

    public Task<IReadOnlyList<SpeedBandShare>> GetSpeedBandsAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        var (where, parameters) = TrafficQueryBuilder.BuildForCityHours(filter);
        var sql = $"""
            SELECT
                b.band_order::int                                             AS band_order,
                (ARRAY['0-19', '20-39', '40-59', '60-79', '80+'])[b.band_order] AS speed_band,
                SUM(b.row_count)::bigint                                      AS observation_count,
                SUM(b.vehicle_count)::bigint                                  AS vehicle_observations,
                ROUND(100.0 * SUM(b.vehicle_count) / SUM(SUM(b.vehicle_count)) OVER (), 2) AS vehicle_share_pct
            FROM traffic.agg_city_hourly AS f
            JOIN traffic.agg_city_speed_band AS b USING (observed_at)
            WHERE {where}
            GROUP BY b.band_order
            ORDER BY b.band_order
            """;
        return QueryAsync<SpeedBandShare>(sql, parameters, cancellationToken);
    }

    public async Task<DatasetMetadata> GetMetadataAsync(CancellationToken cancellationToken)
    {
        const string RangeSql = """
            SELECT
                MIN(date_key)                                      AS first_date,
                MAX(date_key)                                      AS last_date,
                (SELECT COUNT(*)::int FROM traffic.dim_location)   AS location_count
            FROM traffic.agg_city_hourly
            """;
        const string MonthsSql = "SELECT month FROM traffic.load_audit ORDER BY month";

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var metadata = await connection.QuerySingleAsync<DatasetMetadata>(
            new CommandDefinition(RangeSql, cancellationToken: cancellationToken));
        var months = await connection.QueryAsync<DateOnly>(
            new CommandDefinition(MonthsSql, cancellationToken: cancellationToken));

        return metadata with { LoadedMonths = months.AsList() };
    }

    private async Task<IReadOnlyList<T>> QueryAsync<T>(string sql, DynamicParameters parameters, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<T>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
        return rows.AsList();
    }
}
