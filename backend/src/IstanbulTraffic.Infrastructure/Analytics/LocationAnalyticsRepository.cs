using Dapper;
using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Domain.Traffic;
using Npgsql;

namespace IstanbulTraffic.Infrastructure.Analytics;

internal sealed class LocationAnalyticsRepository(NpgsqlDataSource dataSource) : ILocationAnalyticsRepository
{
    public async Task<IReadOnlyList<SlowestLocation>> GetSlowestAsync(SlowestLocationsRequest request, CancellationToken cancellationToken)
    {
        var (where, parameters) = TrafficQueryBuilder.Build(request.Filter);
        parameters.Add("StartHour", (short)request.StartHour);
        parameters.Add("EndHour", (short)request.EndHour);
        parameters.Add("MinimumObservations", TrafficRules.MinimumLocationObservations);
        parameters.Add("Limit", request.Limit);

        var sql = $"""
            WITH measured AS (
                SELECT
                    f.location_id,
                    COUNT(*)                       AS observed_hours,
                    ROUND(AVG(f.vehicle_count), 1) AS average_vehicle_count,
                    ROUND(SUM(f.speed_volume)::numeric / SUM(f.vehicle_count), 2) AS weighted_average_speed_kmh
                FROM traffic.fact_traffic_hourly AS f
                WHERE {where}
                  AND NOT f.is_low_sample
                  AND f.hour_of_day BETWEEN @StartHour AND @EndHour
                GROUP BY f.location_id
                HAVING COUNT(*) >= @MinimumObservations
            ),
            ranked AS (
                SELECT
                    *,
                    ROW_NUMBER() OVER (ORDER BY weighted_average_speed_kmh, location_id)::int AS rank
                FROM measured
            )
            SELECT
                r.rank,
                l.geohash,
                ROUND(l.latitude::numeric, 5)  AS latitude,
                ROUND(l.longitude::numeric, 5) AS longitude,
                r.observed_hours,
                r.average_vehicle_count,
                r.weighted_average_speed_kmh
            FROM ranked AS r
            JOIN traffic.dim_location AS l USING (location_id)
            WHERE r.rank <= @Limit
            ORDER BY r.rank
            """;

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<SlowestLocation>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
        return rows.AsList();
    }

    public async Task<IReadOnlyList<CongestionPoint>> GetCongestionMapAsync(TrafficFilter filter, CancellationToken cancellationToken)
    {
        // Night and evening peak sums are pre-filtered in traffic.agg_location_daily
        // with the hours of TrafficRules, so only the date range applies here.
        var (where, parameters) = TrafficQueryBuilder.BuildForLocationDays(filter with { DayType = DayType.All });
        parameters.Add("MinimumObservations", TrafficRules.MinimumLocationObservations);

        var sql = $"""
            WITH measured AS (
                SELECT
                    d.location_id,
                    SUM(d.night_speed_volume)::numeric / NULLIF(SUM(d.night_vehicles), 0) AS free_flow_speed_kmh,
                    SUM(d.peak_speed_volume)::numeric / NULLIF(SUM(d.peak_vehicles), 0)   AS peak_speed_kmh,
                    SUM(d.peak_vehicles)::numeric / NULLIF(SUM(d.peak_hours), 0)          AS average_vehicle_count
                FROM traffic.agg_location_daily AS d
                WHERE {where}
                GROUP BY d.location_id
                HAVING SUM(d.night_hours) >= @MinimumObservations
                   AND SUM(d.peak_hours) >= @MinimumObservations
            )
            SELECT
                l.geohash,
                ROUND(l.latitude::numeric, 5)                       AS latitude,
                ROUND(l.longitude::numeric, 5)                      AS longitude,
                ROUND(m.average_vehicle_count, 1)                   AS average_peak_vehicle_count,
                ROUND(m.free_flow_speed_kmh, 2)                     AS free_flow_speed_kmh,
                ROUND(m.peak_speed_kmh, 2)                          AS peak_speed_kmh,
                ROUND(1 - m.peak_speed_kmh / m.free_flow_speed_kmh, 3) AS congestion_index
            FROM measured AS m
            JOIN traffic.dim_location AS l USING (location_id)
            ORDER BY l.geohash
            """;

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<CongestionPoint>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
        return rows.AsList();
    }

    public async Task<LocationProfile?> GetProfileAsync(string geohash, TrafficFilter filter, CancellationToken cancellationToken)
    {
        var (where, parameters) = TrafficQueryBuilder.Build(filter);
        parameters.Add("Geohash", geohash);

        var detailsSql = $"""
            SELECT
                l.geohash,
                ROUND(l.latitude::numeric, 5)  AS latitude,
                ROUND(l.longitude::numeric, 5) AS longitude,
                COUNT(f.location_id)           AS observation_count,
                CORR(f.vehicle_count, f.avg_speed_kmh) FILTER (WHERE NOT f.is_low_sample) AS vehicle_speed_correlation
            FROM traffic.dim_location AS l
            LEFT JOIN traffic.fact_traffic_hourly AS f
                ON f.location_id = l.location_id AND {where}
            WHERE l.geohash = @Geohash
            GROUP BY l.geohash, l.latitude, l.longitude
            """;

        var hourlySql = $"""
            SELECT
                f.hour_of_day::int           AS hour_of_day,
                COUNT(*)                     AS observation_count,
                SUM(f.vehicle_count)::bigint AS vehicle_observations,
                ROUND(SUM(f.speed_volume)::numeric / SUM(f.vehicle_count), 2) AS weighted_average_speed_kmh
            FROM traffic.fact_traffic_hourly AS f
            JOIN traffic.dim_location AS l USING (location_id)
            WHERE {where} AND l.geohash = @Geohash
            GROUP BY f.hour_of_day
            ORDER BY f.hour_of_day
            """;

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var details = await connection.QuerySingleOrDefaultAsync<LocationDetails>(
            new CommandDefinition(detailsSql, parameters, cancellationToken: cancellationToken));
        if (details is null)
        {
            return null;
        }

        var hourly = await connection.QueryAsync<HourlyProfilePoint>(
            new CommandDefinition(hourlySql, parameters, cancellationToken: cancellationToken));
        return new LocationProfile(details, hourly.AsList());
    }
}
