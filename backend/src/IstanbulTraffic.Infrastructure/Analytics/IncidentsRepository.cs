using Dapper;
using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Domain.Incidents;
using IstanbulTraffic.Domain.Traffic;
using Npgsql;

namespace IstanbulTraffic.Infrastructure.Analytics;

/// <summary>Incident analyses over traffic.fact_incident, joined with weather and hourly traffic where they overlap.</summary>
internal sealed class IncidentsRepository(NpgsqlDataSource dataSource) : IIncidentsRepository
{
    private const string Period = "i.started_at >= @From AND i.started_at < @ToExclusive";
    private const string RoadOnly = "i.category <> 'other'";
    private const string Severe = "i.severity = ANY(@Severe)";

    public async Task<IncidentMetadata> GetMetadataAsync(CancellationToken cancellationToken)
    {
        const string Sql = """
            SELECT
                (SELECT MIN(started_at)::date FROM traffic.fact_incident) AS first_date,
                (SELECT MAX(started_at)::date FROM traffic.fact_incident) AS last_date,
                (SELECT COUNT(*) FROM traffic.fact_incident)              AS incident_count,
                a.loaded_at,
                a.source_file,
                (SELECT MIN(date_key) FROM traffic.agg_city_hourly)       AS traffic_first_date,
                (SELECT MAX(date_key) FROM traffic.agg_city_hourly)       AS traffic_last_date
            FROM (SELECT 1) AS one
            LEFT JOIN LATERAL (
                SELECT loaded_at, source_file FROM traffic.incident_load_audit ORDER BY loaded_at DESC LIMIT 1
            ) AS a ON true
            """;
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        return await connection.QuerySingleAsync<IncidentMetadata>(new CommandDefinition(Sql, cancellationToken: cancellationToken));
    }

    public async Task<IncidentSummary> GetSummaryAsync(ResolvedIncidentFilter filter, CancellationToken cancellationToken)
    {
        var parameters = Parameters(filter);
        const string CategoriesSql = $"""
            WITH current_period AS (
                SELECT i.category, COUNT(*)::int AS incidents,
                       percentile_cont(0.5) WITHIN GROUP (ORDER BY i.duration_min) AS median_duration,
                       percentile_cont(0.5) WITHIN GROUP (ORDER BY i.response_min) AS median_response
                FROM traffic.fact_incident AS i
                WHERE {Period} AND {RoadOnly}
                GROUP BY i.category
            ),
            previous_period AS (
                SELECT i.category, COUNT(*)::int AS incidents
                FROM traffic.fact_incident AS i
                WHERE i.started_at >= @From - INTERVAL '1 year' AND i.started_at < @ToExclusive - INTERVAL '1 year' AND {RoadOnly}
                GROUP BY i.category
            )
            SELECT c.category, c.incidents,
                   ROUND(c.median_duration::numeric, 1) AS median_duration_min,
                   ROUND(c.median_response::numeric, 1) AS median_response_min,
                   p.incidents AS previous_year_incidents
            FROM current_period AS c
            LEFT JOIN previous_period AS p USING (category)
            ORDER BY c.incidents DESC
            """;
        const string SeveritySql = $"""
            SELECT i.severity, COUNT(*)::int AS incidents
            FROM traffic.fact_incident AS i
            WHERE {Period} AND i.category = 'accident'
            GROUP BY i.severity
            ORDER BY array_position(ARRAY['damage', 'injury', 'chain', 'fatal', 'unknown'], i.severity)
            """;
        const string LanesSql = $"""
            SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE i.closed_lanes IS NOT NULL) / NULLIF(COUNT(*), 0), 1)
            FROM traffic.fact_incident AS i
            WHERE {Period} AND i.category = 'accident'
            """;

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var categories = await connection.QueryAsync<CategoryCount>(Command(CategoriesSql, parameters, cancellationToken));
        var severity = await connection.QueryAsync<SeverityCount>(Command(SeveritySql, parameters, cancellationToken));
        var closedLanes = await connection.ExecuteScalarAsync<decimal?>(Command(LanesSql, parameters, cancellationToken));
        return new IncidentSummary(filter, filter.To.DayNumber - filter.From.DayNumber + 1, categories.AsList(), severity.AsList(), closedLanes);
    }

    public Task<IReadOnlyList<IncidentMonth>> GetMonthlyAsync(CancellationToken cancellationToken)
    {
        const string Sql = $"""
            SELECT date_trunc('month', i.started_at)::date AS month, i.category, COUNT(*)::int AS incidents,
                   COUNT(*) FILTER (WHERE {Severe})::int AS severe_accidents
            FROM traffic.fact_incident AS i
            WHERE {RoadOnly}
            GROUP BY 1, 2
            ORDER BY 1, 2
            """;
        return QueryAsync<IncidentMonth>(Sql, new DynamicParameters(new { Severe = IncidentRules.SevereAccidents.ToArray() }), cancellationToken);
    }

    public Task<IReadOnlyList<IncidentWeekHour>> GetWeekHourAsync(ResolvedIncidentFilter filter, CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT i.iso_day_of_week::int AS iso_day_of_week, i.hour_of_day::int AS hour_of_day, COUNT(*)::int AS incidents
            FROM traffic.fact_incident AS i
            WHERE {Period} AND {CategoryClause(filter)}
            GROUP BY 1, 2
            ORDER BY 1, 2
            """;
        return QueryAsync<IncidentWeekHour>(sql, Parameters(filter), cancellationToken);
    }

    public async Task<IReadOnlyList<IncidentCell>> GetCellsAsync(ResolvedIncidentFilter filter, CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT i.geohash,
                   MAX(i.neighborhood) AS neighborhood,
                   MAX(i.district)     AS district,
                   COUNT(*)::int       AS incidents,
                   COUNT(*) FILTER (WHERE i.category = 'accident')::int  AS accidents,
                   COUNT(*) FILTER (WHERE {Severe})::int                  AS severe_accidents,
                   COUNT(*) FILTER (WHERE i.category = 'breakdown')::int AS breakdowns,
                   COUNT(*) FILTER (WHERE i.category = 'roadworks')::int AS roadworks,
                   ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY i.duration_min))::numeric, 1) AS median_duration_min
            FROM traffic.fact_incident AS i
            WHERE {Period} AND {CategoryClause(filter)}
            GROUP BY i.geohash
            ORDER BY i.geohash
            """;
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var cells = await connection.QueryAsync<IncidentCell>(Command(sql, Parameters(filter), cancellationToken));
        return cells.Select(WithCenter).ToList();
    }

    public async Task<IncidentCellDetail?> GetCellDetailAsync(string geohash, ResolvedIncidentFilter filter, CancellationToken cancellationToken)
    {
        var parameters = Parameters(filter);
        parameters.Add("Geohash", geohash);
        var cellSql = $"""
            SELECT i.geohash, MAX(i.neighborhood) AS neighborhood, MAX(i.district) AS district,
                   COUNT(*)::int AS incidents,
                   COUNT(*) FILTER (WHERE i.category = 'accident')::int  AS accidents,
                   COUNT(*) FILTER (WHERE {Severe})::int                  AS severe_accidents,
                   COUNT(*) FILTER (WHERE i.category = 'breakdown')::int AS breakdowns,
                   COUNT(*) FILTER (WHERE i.category = 'roadworks')::int AS roadworks,
                   ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY i.duration_min))::numeric, 1) AS median_duration_min
            FROM traffic.fact_incident AS i
            WHERE i.geohash = @Geohash AND {Period} AND {CategoryClause(filter)}
            GROUP BY i.geohash
            """;
        var categoriesSql = $"""
            SELECT i.category, COUNT(*)::int AS incidents,
                   ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY i.duration_min))::numeric, 1) AS median_duration_min,
                   ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY i.response_min))::numeric, 1) AS median_response_min
            FROM traffic.fact_incident AS i
            WHERE i.geohash = @Geohash AND {Period} AND {RoadOnly}
            GROUP BY i.category
            ORDER BY incidents DESC
            """;
        var hourlySql = $"""
            SELECT h AS hour_of_day, COALESCE(c.incidents, 0) AS incidents
            FROM generate_series(0, 23) AS h
            LEFT JOIN (
                SELECT i.hour_of_day, COUNT(*)::int AS incidents
                FROM traffic.fact_incident AS i
                WHERE i.geohash = @Geohash AND {Period} AND {CategoryClause(filter)}
                GROUP BY i.hour_of_day
            ) AS c ON c.hour_of_day = h
            ORDER BY h
            """;
        var segmentsSql = $"""
            SELECT COALESCE(i.road, '') AS road, i.segment, COUNT(*)::int AS incidents,
                   COUNT(*) FILTER (WHERE i.category = 'accident')::int  AS accidents,
                   COUNT(*) FILTER (WHERE {Severe})::int                  AS severe_accidents,
                   COUNT(*) FILTER (WHERE i.category = 'breakdown')::int AS breakdowns,
                   ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY i.duration_min))::numeric, 1) AS median_duration_min
            FROM traffic.fact_incident AS i
            WHERE i.geohash = @Geohash AND {Period} AND {CategoryClause(filter)} AND i.segment IS NOT NULL
            GROUP BY 1, 2
            ORDER BY incidents DESC
            LIMIT 5
            """;
        var latestSql = $"""
            SELECT i.incident_id, i.started_at, i.category, i.severity, i.title, i.duration_min, i.closed_lanes
            FROM traffic.fact_incident AS i
            WHERE i.geohash = @Geohash AND {Period} AND {CategoryClause(filter)}
            ORDER BY i.started_at DESC
            LIMIT @Latest
            """;
        parameters.Add("Latest", IncidentRules.LatestIncidentsPerCell);

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var cell = await connection.QuerySingleOrDefaultAsync<IncidentCell>(Command(cellSql, parameters, cancellationToken));
        if (cell is null)
        {
            return null;
        }

        var categories = await connection.QueryAsync<CategoryCount>(Command(categoriesSql, parameters, cancellationToken));
        var hourly = await connection.QueryAsync<(int HourOfDay, int Incidents)>(Command(hourlySql, parameters, cancellationToken));
        var segments = await connection.QueryAsync<RoadSegment>(Command(segmentsSql, parameters, cancellationToken));
        var latest = await connection.QueryAsync<IncidentItem>(Command(latestSql, parameters, cancellationToken));
        return new IncidentCellDetail(
            WithCenter(cell),
            categories.AsList(),
            hourly.Select(row => row.Incidents).ToList(),
            segments.AsList(),
            latest.AsList());
    }

    public async Task<IncidentRoads> GetRoadsAsync(ResolvedIncidentFilter filter, int limit, CancellationToken cancellationToken)
    {
        var parameters = Parameters(filter);
        parameters.Add("Limit", limit);
        parameters.Add("MinimumIncidents", IncidentRules.MinimumSegmentIncidents);
        var roadsSql = $"""
            SELECT COALESCE(i.road, 'other') AS road, COUNT(*)::int AS incidents,
                   COUNT(*) FILTER (WHERE i.category = 'accident')::int AS accidents,
                   COUNT(*) FILTER (WHERE {Severe})::int                 AS severe_accidents
            FROM traffic.fact_incident AS i
            WHERE {Period} AND {CategoryClause(filter)}
            GROUP BY 1
            ORDER BY incidents DESC
            """;
        var segmentsSql = $"""
            SELECT i.road, i.segment, COUNT(*)::int AS incidents,
                   COUNT(*) FILTER (WHERE i.category = 'accident')::int  AS accidents,
                   COUNT(*) FILTER (WHERE {Severe})::int                  AS severe_accidents,
                   COUNT(*) FILTER (WHERE i.category = 'breakdown')::int AS breakdowns,
                   ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY i.duration_min))::numeric, 1) AS median_duration_min,
                   mode() WITHIN GROUP (ORDER BY i.geohash) AS geohash
            FROM traffic.fact_incident AS i
            WHERE {Period} AND {CategoryClause(filter)} AND i.road IS NOT NULL AND i.segment IS NOT NULL
            GROUP BY i.road, i.segment
            HAVING COUNT(*) >= @MinimumIncidents
            ORDER BY incidents DESC, i.road, i.segment
            LIMIT @Limit
            """;
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var roads = await connection.QueryAsync<RoadTotal>(Command(roadsSql, parameters, cancellationToken));
        var segments = await connection.QueryAsync<RoadSegment>(Command(segmentsSql, parameters, cancellationToken));
        return new IncidentRoads(roads.AsList(), segments.AsList());
    }

    public async Task<IncidentDurations> GetDurationsAsync(ResolvedIncidentFilter filter, CancellationToken cancellationToken)
    {
        const string CategoriesSql = $"""
            SELECT i.category, COUNT(*)::int AS incidents,
                   ROUND((percentile_cont(0.50) WITHIN GROUP (ORDER BY i.duration_min))::numeric, 1) AS median_duration_min,
                   ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY i.duration_min))::numeric, 1) AS p75_duration_min,
                   ROUND((percentile_cont(0.90) WITHIN GROUP (ORDER BY i.duration_min))::numeric, 1) AS p90_duration_min,
                   ROUND((percentile_cont(0.50) WITHIN GROUP (ORDER BY i.response_min))::numeric, 1) AS median_response_min,
                   COUNT(i.response_min)::int AS response_count
            FROM traffic.fact_incident AS i
            WHERE {Period} AND {RoadOnly}
            GROUP BY i.category
            ORDER BY incidents DESC
            """;
        const string YearlySql = """
            SELECT EXTRACT(YEAR FROM i.started_at)::int AS year, COUNT(*)::int AS accidents,
                   ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY i.duration_min))::numeric, 1) AS median_duration_min,
                   ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY i.response_min))::numeric, 1) AS median_response_min,
                   COUNT(i.response_min)::int AS response_count
            FROM traffic.fact_incident AS i
            WHERE i.category = 'accident'
            GROUP BY 1
            ORDER BY 1
            """;
        var parameters = Parameters(filter);
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var categories = await connection.QueryAsync<DurationStats>(Command(CategoriesSql, parameters, cancellationToken));
        var yearly = await connection.QueryAsync<YearlyDuration>(Command(YearlySql, parameters, cancellationToken));
        return new IncidentDurations(categories.AsList(), yearly.AsList());
    }

    public Task<IReadOnlyList<IncidentWeatherEffect>> GetWeatherAsync(ResolvedIncidentFilter filter, CancellationToken cancellationToken)
    {
        // Every hour of the period counts, including hours without accidents, so rates are per hour of weather.
        const string Sql = $"""
            WITH hours AS (
                SELECT w.observed_at, date_trunc('month', w.observed_at) AS month, EXTRACT(HOUR FROM w.observed_at)::int AS hour,
                       CASE
                           WHEN w.snowfall_cm > 0 THEN 'snow'
                           WHEN w.precipitation_mm >= @HeavyRainMm THEN 'heavy_rain'
                           WHEN w.precipitation_mm >= @LightRainMm THEN 'light_rain'
                           ELSE 'dry'
                       END AS condition
                FROM traffic.weather_hourly AS w
                WHERE w.observed_at >= @From AND w.observed_at < @ToExclusive
                  AND w.observed_at <= (SELECT MAX(started_at) FROM traffic.fact_incident)
            ),
            counts AS (
                SELECT date_trunc('hour', i.started_at) AS hour_start, COUNT(*) AS accidents,
                       COUNT(*) FILTER (WHERE {Severe}) AS severe
                FROM traffic.fact_incident AS i
                WHERE {Period} AND i.category = 'accident'
                GROUP BY 1
            ),
            joined AS (
                SELECT h.*, COALESCE(c.accidents, 0) AS accidents, COALESCE(c.severe, 0) AS severe
                FROM hours AS h
                LEFT JOIN counts AS c ON c.hour_start = h.observed_at
            ),
            baseline AS (
                SELECT month, hour, AVG(accidents) AS rate, AVG(severe) AS severe_rate
                FROM joined
                WHERE condition = 'dry'
                GROUP BY month, hour
            )
            SELECT j.condition,
                   COUNT(*)::int                AS hours,
                   SUM(j.accidents)::int        AS accidents,
                   ROUND(SUM(b.rate), 1)        AS expected_accidents,
                   ROUND(SUM(j.accidents) / NULLIF(SUM(b.rate), 0), 2)      AS rate_ratio,
                   ROUND(SUM(j.severe) / NULLIF(SUM(b.severe_rate), 0), 2)  AS severe_rate_ratio
            FROM joined AS j
            JOIN baseline AS b USING (month, hour)
            GROUP BY j.condition
            ORDER BY array_position(ARRAY['dry', 'light_rain', 'heavy_rain', 'snow'], j.condition)
            """;
        var parameters = Parameters(filter);
        parameters.Add("LightRainMm", TrafficRules.LightRainMm);
        parameters.Add("HeavyRainMm", TrafficRules.HeavyRainMm);
        return QueryAsync<IncidentWeatherEffect>(Sql, parameters, cancellationToken);
    }

    public async Task<IncidentTrafficImpact> GetTrafficImpactAsync(CancellationToken cancellationToken)
    {
        const string BoundsSql = """
            SELECT MIN(date_key) AS first_date, MAX(date_key) AS last_date,
                   (SELECT COUNT(DISTINCT incident_id)::int FROM traffic.incident_traffic_impact) AS matched
            FROM traffic.agg_city_hourly
            """;
        const string RecoverySql = """
            SELECT CASE WHEN i.category = 'accident' THEN 'accident_' || i.severity ELSE i.category END AS "group",
                   t.offset_hours::int AS offset_hours,
                   COUNT(*)::int AS incidents,
                   ROUND(AVG(t.speed_kmh - t.baseline_speed_kmh), 2) AS speed_change_kmh,
                   ROUND(100 * AVG((t.speed_kmh - t.baseline_speed_kmh) / NULLIF(t.baseline_speed_kmh, 0)), 1) AS speed_change_pct
            FROM traffic.incident_traffic_impact AS t
            JOIN traffic.fact_incident AS i USING (incident_id)
            WHERE i.severity IS DISTINCT FROM 'unknown'
            GROUP BY 1, 2
            ORDER BY 1, 2
            """;
        const string LanesSql = """
            SELECT i.closed_lanes, COUNT(*)::int AS accidents, ROUND(AVG(t.speed_kmh - t.baseline_speed_kmh), 2) AS speed_change_kmh
            FROM traffic.incident_traffic_impact AS t
            JOIN traffic.fact_incident AS i USING (incident_id)
            WHERE t.offset_hours = 0 AND i.category = 'accident'
            GROUP BY i.closed_lanes
            HAVING COUNT(*) >= 20
            ORDER BY i.closed_lanes NULLS LAST
            """;
        // Weekday evenings with all three peak hours measured, against the evenings of the same month.
        const string EveningsCte = """
            WITH evenings AS (
                SELECT f.date_key, SUM(f.speed_volume)::numeric / NULLIF(SUM(f.vehicle_count), 0) AS speed
                FROM traffic.agg_city_hourly AS f
                WHERE f.vehicle_count > 0 AND NOT f.is_weekend AND NOT f.is_public_holiday AND NOT f.is_partial_hour
                  AND f.hour_of_day BETWEEN @EveningStart AND @EveningEnd
                GROUP BY f.date_key
                HAVING COUNT(*) = @EveningHours
            ),
            compared AS (
                SELECT e.date_key, e.speed,
                       e.speed - AVG(e.speed) OVER (PARTITION BY date_trunc('month', e.date_key)) AS change
                FROM evenings AS e
            ),
            evening_accidents AS (
                -- One pass over the overlap period instead of a lookup per evening.
                SELECT i.started_at::date AS date_key, COUNT(*) AS accidents,
                       COUNT(*) FILTER (WHERE i.severity = ANY(@Severe)) AS severe_accidents
                FROM traffic.fact_incident AS i
                WHERE i.category = 'accident'
                  AND i.started_at >= (SELECT MIN(date_key) FROM evenings)
                  AND i.started_at < (SELECT MAX(date_key) FROM evenings) + 1
                  AND EXTRACT(HOUR FROM i.started_at) BETWEEN @EveningStart AND @EveningEnd
                GROUP BY 1
            ),
            evening_rain AS (
                SELECT w.observed_at::date AS date_key, SUM(w.precipitation_mm) AS rain
                FROM traffic.weather_hourly AS w
                WHERE w.observed_at >= (SELECT MIN(date_key) FROM evenings)
                  AND w.observed_at < (SELECT MAX(date_key) FROM evenings) + 1
                  AND EXTRACT(HOUR FROM w.observed_at) BETWEEN @EveningStart AND @EveningEnd
                GROUP BY 1
            ),
            context AS (
                SELECT c.*, COALESCE(a.accidents, 0) AS accidents, COALESCE(a.severe_accidents, 0) AS severe_accidents, r.rain
                FROM compared AS c
                LEFT JOIN evening_accidents AS a USING (date_key)
                LEFT JOIN evening_rain AS r USING (date_key)
            )
            """;
        const string SlowestSql = EveningsCte + """
            SELECT x.date_key AS date, d.day_name, ROUND(x.speed, 2) AS evening_speed_kmh, ROUND(x.change, 2) AS speed_change_kmh,
                   x.accidents::int AS accidents, x.severe_accidents::int AS severe_accidents, ROUND(x.rain, 1) AS rain_mm,
                   (SELECT i.title FROM traffic.fact_incident AS i
                    WHERE i.started_at >= x.date_key + make_interval(hours => @EveningStart - 1)
                      AND i.started_at < x.date_key + make_interval(hours => @EveningEnd + 1)
                      AND i.category IN ('accident', 'vehicle_fire', 'closure')
                    ORDER BY array_position(ARRAY['fatal', 'chain', 'injury', 'damage'], i.severity) NULLS LAST,
                             i.closed_lanes DESC NULLS LAST, i.duration_min DESC NULLS LAST
                    LIMIT 1) AS largest_incident
            FROM context AS x
            JOIN traffic.dim_date AS d USING (date_key)
            ORDER BY x.change
            LIMIT 15
            """;
        const string ExplanationSql = EveningsCte + """
            , ranked AS (
                SELECT x.*, percent_rank() OVER (ORDER BY x.change) AS position FROM context AS x
            )
            SELECT COUNT(*)::int AS evenings,
                   ROUND(100.0 * COUNT(*) FILTER (WHERE position <= 0.1 AND rain >= @WetEveningMm) / NULLIF(COUNT(*) FILTER (WHERE position <= 0.1), 0), 1) AS slow_with_rain_pct,
                   ROUND(100.0 * COUNT(*) FILTER (WHERE position <= 0.1 AND severe_accidents > 0) / NULLIF(COUNT(*) FILTER (WHERE position <= 0.1), 0), 1) AS slow_with_severe_accident_pct,
                   ROUND(100.0 * COUNT(*) FILTER (WHERE rain >= @WetEveningMm) / NULLIF(COUNT(*), 0), 1) AS all_with_rain_pct,
                   ROUND(100.0 * COUNT(*) FILTER (WHERE severe_accidents > 0) / NULLIF(COUNT(*), 0), 1) AS all_with_severe_accident_pct
            FROM ranked
            """;

        var parameters = new DynamicParameters(new
        {
            Severe = IncidentRules.SevereAccidents.ToArray(),
            EveningStart = TrafficRules.EveningPeakStartHour,
            EveningEnd = TrafficRules.EveningPeakEndHour,
            EveningHours = TrafficRules.EveningPeakEndHour - TrafficRules.EveningPeakStartHour + 1,
            TrafficRules.WetEveningMm,
        });

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var bounds = await connection.QuerySingleAsync<(DateOnly? FirstDate, DateOnly? LastDate, int Matched)>(Command(BoundsSql, parameters, cancellationToken));
        var recovery = await connection.QueryAsync<ImpactPoint>(Command(RecoverySql, parameters, cancellationToken));
        var lanes = await connection.QueryAsync<LaneImpact>(Command(LanesSql, parameters, cancellationToken));
        var slowest = await connection.QueryAsync<SlowEvening>(Command(SlowestSql, parameters, cancellationToken));
        var explanation = await connection.QuerySingleOrDefaultAsync<EveningExplanation>(Command(ExplanationSql, parameters, cancellationToken));
        return new IncidentTrafficImpact(
            bounds.FirstDate,
            bounds.LastDate,
            bounds.Matched,
            recovery.AsList(),
            lanes.AsList(),
            slowest.AsList(),
            explanation is { Evenings: > 0 } ? explanation : null);
    }

    private static IncidentCell WithCenter(IncidentCell cell)
    {
        var (latitude, longitude) = Geohash.Center(cell.Geohash);
        return cell with { Latitude = Math.Round(latitude, 5), Longitude = Math.Round(longitude, 5) };
    }

    public Task<IReadOnlyList<LatestIncident>> GetLatestAsync(string? category, int limit, CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT i.incident_id, i.started_at, i.ended_at, i.category, i.severity, i.title, i.road,
                   i.duration_min, i.closed_lanes, i.geohash, i.neighborhood, i.district
            FROM traffic.fact_incident AS i
            WHERE {(category is null ? RoadOnly : "i.category = @Category")}
            ORDER BY i.started_at DESC, i.incident_id DESC
            LIMIT @Limit
            """;
        var parameters = new DynamicParameters();
        parameters.Add("Category", category);
        parameters.Add("Limit", limit);
        return QueryAsync<LatestIncident>(sql, parameters, cancellationToken);
    }

    private static string CategoryClause(ResolvedIncidentFilter filter) =>
        filter.Category is null ? RoadOnly : "i.category = @Category";

    private static DynamicParameters Parameters(ResolvedIncidentFilter filter)
    {
        var parameters = new DynamicParameters();
        parameters.Add("From", filter.From.ToDateTime(TimeOnly.MinValue));
        parameters.Add("ToExclusive", filter.To.AddDays(1).ToDateTime(TimeOnly.MinValue));
        parameters.Add("Category", filter.Category);
        parameters.Add("Severe", IncidentRules.SevereAccidents.ToArray());
        return parameters;
    }

    private static CommandDefinition Command(string sql, DynamicParameters parameters, CancellationToken cancellationToken) =>
        new(sql, parameters, cancellationToken: cancellationToken);

    private async Task<IReadOnlyList<T>> QueryAsync<T>(string sql, DynamicParameters parameters, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<T>(Command(sql, parameters, cancellationToken));
        return rows.AsList();
    }
}
