using Dapper;
using IstanbulTraffic.Application.Abstractions;
using IstanbulTraffic.Application.Contracts;
using IstanbulTraffic.Domain.Traffic;
using Npgsql;

namespace IstanbulTraffic.Infrastructure.Analytics;

/// <summary>Long-term analyses over every loaded month. All queries read the aggregate layer.</summary>
internal sealed class InsightsRepository(NpgsqlDataSource dataSource) : IInsightsRepository
{
    private const string WeightedSpeed = "ROUND(SUM(f.speed_volume)::numeric / NULLIF(SUM(f.vehicle_count), 0), 2)";
    private const string AverageVehicles = "ROUND(SUM(f.vehicle_count)::numeric / NULLIF(SUM(f.eligible_row_count), 0), 1)";
    private const string Workday = "NOT f.is_weekend AND NOT f.is_public_holiday";

    public Task<IReadOnlyList<MonthlyInsight>> GetMonthlyAsync(CancellationToken cancellationToken)
    {
        const string Sql = $"""
            WITH monthly AS (
                SELECT
                    date_trunc('month', f.observed_at)::date                    AS month,
                    COUNT(*) FILTER (WHERE f.vehicle_count > 0)::int              AS observed_hours,
                    COUNT(*) FILTER (WHERE f.is_partial_hour)::int                AS partial_hours,
                    SUM(f.vehicle_count)::bigint                                  AS vehicle_observations,
                    SUM(f.vehicle_count)::numeric / NULLIF(SUM(f.eligible_row_count), 0) AS average_vehicle_count,
                    SUM(f.speed_volume)::numeric / NULLIF(SUM(f.vehicle_count), 0) AS speed,
                    SUM(f.speed_volume) FILTER (WHERE {Workday} AND f.hour_of_day BETWEEN @MorningStart AND @MorningEnd)::numeric
                        / NULLIF(SUM(f.vehicle_count) FILTER (WHERE {Workday} AND f.hour_of_day BETWEEN @MorningStart AND @MorningEnd), 0) AS morning,
                    SUM(f.speed_volume) FILTER (WHERE {Workday} AND f.hour_of_day BETWEEN @EveningStart AND @EveningEnd)::numeric
                        / NULLIF(SUM(f.vehicle_count) FILTER (WHERE {Workday} AND f.hour_of_day BETWEEN @EveningStart AND @EveningEnd), 0) AS evening,
                    SUM(f.speed_volume) FILTER (WHERE f.hour_of_day BETWEEN @NightStart AND @NightEnd)::numeric
                        / NULLIF(SUM(f.vehicle_count) FILTER (WHERE f.hour_of_day BETWEEN @NightStart AND @NightEnd), 0) AS night
                FROM traffic.agg_city_hourly AS f
                GROUP BY 1
            ),
            workday_hours AS (
                SELECT
                    date_trunc('month', f.observed_at)::date AS month,
                    f.date_key,
                    f.speed_volume::numeric / f.vehicle_count AS speed
                FROM traffic.agg_city_hourly AS f
                WHERE f.vehicle_count > 0 AND {Workday}
            ),
            congested AS (
                SELECT month, AVG(congested_hours) AS per_day
                FROM (
                    SELECT w.month, w.date_key, COUNT(*) FILTER (WHERE w.speed < m.night * @CongestedRatio) AS congested_hours
                    FROM workday_hours AS w
                    JOIN monthly AS m USING (month)
                    GROUP BY w.month, w.date_key
                    HAVING COUNT(*) >= @MinimumHoursPerDay
                ) AS days
                GROUP BY month
            )
            SELECT
                m.month,
                EXTRACT(DAY FROM m.month + INTERVAL '1 month' - INTERVAL '1 day')::int AS days_in_month,
                m.observed_hours,
                m.partial_hours,
                ROUND(100.0 * m.observed_hours / (24 * EXTRACT(DAY FROM m.month + INTERVAL '1 month' - INTERVAL '1 day')), 2) AS coverage_pct,
                COALESCE(a.row_count, 0)       AS row_count,
                COALESCE(a.location_count, 0)  AS location_count,
                m.vehicle_observations,
                ROUND(m.average_vehicle_count, 1) AS average_vehicle_count,
                ROUND(m.speed, 2)                 AS weighted_average_speed_kmh,
                ROUND(m.morning, 2)               AS morning_peak_speed_kmh,
                ROUND(m.evening, 2)               AS evening_peak_speed_kmh,
                ROUND(m.night, 2)                 AS night_speed_kmh,
                ROUND(1 - m.evening / NULLIF(m.night, 0), 3) AS congestion_index,
                ROUND(c.per_day, 1)               AS congested_hours_per_weekday
            FROM monthly AS m
            LEFT JOIN traffic.load_audit AS a ON a.month = m.month
            LEFT JOIN congested AS c ON c.month = m.month
            ORDER BY m.month
            """;

        var parameters = new DynamicParameters(new
        {
            MorningStart = (short)TrafficRules.MorningPeakStartHour,
            MorningEnd = (short)TrafficRules.MorningPeakEndHour,
            EveningStart = (short)TrafficRules.EveningPeakStartHour,
            EveningEnd = (short)TrafficRules.EveningPeakEndHour,
            NightStart = (short)TrafficRules.NightStartHour,
            NightEnd = (short)TrafficRules.NightEndHour,
            CongestedRatio = TrafficRules.CongestedSpeedRatio,
            TrafficRules.MinimumHoursPerDay,
        });
        return QueryAsync<MonthlyInsight>(Sql, parameters, cancellationToken);
    }

    public Task<IReadOnlyList<MonthHourCell>> GetMonthHourAsync(CancellationToken cancellationToken)
    {
        const string Sql = $"""
            SELECT
                date_trunc('month', f.observed_at)::date AS month,
                f.hour_of_day::int                       AS hour_of_day,
                {WeightedSpeed}                          AS weighted_average_speed_kmh
            FROM traffic.agg_city_hourly AS f
            WHERE f.vehicle_count > 0 AND {Workday}
            GROUP BY 1, 2
            ORDER BY 1, 2
            """;
        return QueryAsync<MonthHourCell>(Sql, new DynamicParameters(), cancellationToken);
    }

    public Task<IReadOnlyList<DayOfWeekHourCell>> GetDayOfWeekHourAsync(CancellationToken cancellationToken)
    {
        const string Sql = $"""
            SELECT
                d.iso_day_of_week::int AS iso_day_of_week,
                d.day_name,
                f.hour_of_day::int     AS hour_of_day,
                {WeightedSpeed}        AS weighted_average_speed_kmh,
                {AverageVehicles}      AS average_vehicle_count
            FROM traffic.agg_city_hourly AS f
            JOIN traffic.dim_date AS d USING (date_key)
            WHERE f.vehicle_count > 0 AND NOT f.is_public_holiday
            GROUP BY d.iso_day_of_week, d.day_name, f.hour_of_day
            ORDER BY d.iso_day_of_week, f.hour_of_day
            """;
        return QueryAsync<DayOfWeekHourCell>(Sql, new DynamicParameters(), cancellationToken);
    }

    public Task<IReadOnlyList<CalendarDay>> GetCalendarAsync(CancellationToken cancellationToken)
    {
        const string Sql = $"""
            SELECT
                d.date_key                                       AS date,
                d.day_name,
                d.is_weekend,
                BOOL_OR(f.is_public_holiday)                     AS has_public_holiday,
                COUNT(*) FILTER (WHERE f.vehicle_count > 0)::int AS observed_hours,
                SUM(f.vehicle_count)::bigint                     AS vehicle_observations,
                {WeightedSpeed}                                  AS weighted_average_speed_kmh,
                ROUND(
                    SUM(f.speed_volume) FILTER (WHERE f.hour_of_day BETWEEN @EveningStart AND @EveningEnd)::numeric
                    / NULLIF(SUM(f.vehicle_count) FILTER (WHERE f.hour_of_day BETWEEN @EveningStart AND @EveningEnd), 0), 2
                )                                                AS evening_speed_kmh,
                (
                    SELECT string_agg(p.name, ', ' ORDER BY p.start_date)
                    FROM traffic.calendar_period AS p
                    WHERE d.date_key BETWEEN p.start_date AND p.end_date
                )                                                AS periods
            FROM traffic.agg_city_hourly AS f
            JOIN traffic.dim_date AS d USING (date_key)
            GROUP BY d.date_key, d.day_name, d.is_weekend
            ORDER BY d.date_key
            """;

        var parameters = new DynamicParameters(new
        {
            EveningStart = (short)TrafficRules.EveningPeakStartHour,
            EveningEnd = (short)TrafficRules.EveningPeakEndHour,
        });
        return QueryAsync<CalendarDay>(Sql, parameters, cancellationToken);
    }

    public Task<IReadOnlyList<PeriodProfilePoint>> GetPeriodProfilesAsync(CancellationToken cancellationToken)
    {
        // A weekday belongs to the first matching period: Ramadan, summer break,
        // school break, otherwise the school term.
        const string Sql = $"""
            WITH classified AS (
                SELECT
                    d.date_key,
                    COALESCE(
                        (
                            SELECT p.kind
                            FROM traffic.calendar_period AS p
                            WHERE p.kind IN ('ramadan', 'summer_break', 'school_break')
                              AND d.date_key BETWEEN p.start_date AND p.end_date
                            ORDER BY CASE p.kind WHEN 'ramadan' THEN 1 WHEN 'summer_break' THEN 2 ELSE 3 END
                            LIMIT 1
                        ),
                        'school_term'
                    ) AS period
                FROM traffic.dim_date AS d
                WHERE NOT d.is_weekend
            )
            SELECT
                c.period,
                COUNT(DISTINCT f.date_key)::int AS days,
                f.hour_of_day::int              AS hour_of_day,
                {WeightedSpeed}                 AS weighted_average_speed_kmh,
                {AverageVehicles}               AS average_vehicle_count
            FROM traffic.agg_city_hourly AS f
            JOIN classified AS c USING (date_key)
            WHERE f.vehicle_count > 0 AND NOT f.is_public_holiday
            GROUP BY c.period, f.hour_of_day
            ORDER BY c.period, f.hour_of_day
            """;
        return QueryAsync<PeriodProfilePoint>(Sql, new DynamicParameters(), cancellationToken);
    }

    public Task<IReadOnlyList<HolidayEffect>> GetHolidayEffectsAsync(CancellationToken cancellationToken)
    {
        // Each holiday is compared with the same weekdays of the surrounding weeks,
        // using daytime hours only, because night traffic barely changes.
        const string Sql = """
            WITH holidays AS (
                SELECT p.period_code, p.name, p.start_date, p.end_date
                FROM traffic.calendar_period AS p
                WHERE p.kind = 'public_holiday'
                  AND EXISTS (
                      SELECT 1 FROM traffic.agg_city_hourly AS f
                      WHERE f.date_key BETWEEN p.start_date AND p.end_date AND f.vehicle_count > 0
                  )
            ),
            holiday_hours AS (
                SELECT
                    h.period_code,
                    SUM(f.speed_volume) AS speed_volume,
                    SUM(f.vehicle_count) AS vehicles,
                    SUM(f.eligible_row_count) AS observations
                FROM holidays AS h
                JOIN traffic.agg_city_hourly AS f ON f.date_key BETWEEN h.start_date AND h.end_date
                WHERE f.vehicle_count > 0
                  AND f.is_public_holiday
                  AND f.hour_of_day BETWEEN @DaytimeStart AND @DaytimeEnd
                GROUP BY h.period_code
            ),
            baseline AS (
                SELECT
                    h.period_code,
                    SUM(f.speed_volume) AS speed_volume,
                    SUM(f.vehicle_count) AS vehicles,
                    SUM(f.eligible_row_count) AS observations
                FROM holidays AS h
                JOIN traffic.agg_city_hourly AS f
                    ON f.date_key BETWEEN h.start_date - @BaselineDays AND h.end_date + @BaselineDays
                   AND f.date_key NOT BETWEEN h.start_date AND h.end_date
                   AND EXTRACT(ISODOW FROM f.date_key) IN (
                       SELECT EXTRACT(ISODOW FROM day)
                       FROM generate_series(h.start_date, h.end_date, INTERVAL '1 day') AS day
                   )
                WHERE f.vehicle_count > 0
                  AND NOT f.is_public_holiday
                  AND f.hour_of_day BETWEEN @DaytimeStart AND @DaytimeEnd
                GROUP BY h.period_code
            )
            SELECT
                h.period_code                                        AS code,
                h.name,
                h.start_date,
                h.end_date,
                (h.end_date - h.start_date + 1)                      AS days,
                ROUND(hh.speed_volume::numeric / hh.vehicles, 2)     AS holiday_speed_kmh,
                ROUND(b.speed_volume::numeric / b.vehicles, 2)       AS baseline_speed_kmh,
                ROUND(hh.speed_volume::numeric / hh.vehicles - b.speed_volume::numeric / b.vehicles, 2) AS speed_change_kmh,
                ROUND(
                    100.0 * ((hh.vehicles::numeric / hh.observations) / (b.vehicles::numeric / b.observations) - 1), 1
                )                                                    AS volume_change_pct
            FROM holidays AS h
            JOIN holiday_hours AS hh USING (period_code)
            LEFT JOIN baseline AS b USING (period_code)
            ORDER BY h.start_date
            """;

        var parameters = new DynamicParameters(new
        {
            DaytimeStart = (short)TrafficRules.DaytimeStartHour,
            DaytimeEnd = (short)TrafficRules.DaytimeEndHour,
            BaselineDays = TrafficRules.HolidayBaselineDays,
        });
        return QueryAsync<HolidayEffect>(Sql, parameters, cancellationToken);
    }

    public Task<IReadOnlyList<ReliabilityPoint>> GetReliabilityAsync(CancellationToken cancellationToken)
    {
        const string Sql = $"""
            WITH day_hours AS (
                SELECT f.hour_of_day, f.speed_volume::numeric / f.vehicle_count AS speed
                FROM traffic.agg_city_hourly AS f
                WHERE f.vehicle_count > 0 AND {Workday}
            )
            SELECT
                hour_of_day::int AS hour_of_day,
                COUNT(*)::int    AS days,
                ROUND((percentile_cont(0.10) WITHIN GROUP (ORDER BY speed))::numeric, 2) AS p10_speed_kmh,
                ROUND((percentile_cont(0.25) WITHIN GROUP (ORDER BY speed))::numeric, 2) AS p25_speed_kmh,
                ROUND((percentile_cont(0.50) WITHIN GROUP (ORDER BY speed))::numeric, 2) AS median_speed_kmh,
                ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY speed))::numeric, 2) AS p75_speed_kmh,
                ROUND((percentile_cont(0.90) WITHIN GROUP (ORDER BY speed))::numeric, 2) AS p90_speed_kmh
            FROM day_hours
            GROUP BY hour_of_day
            ORDER BY hour_of_day
            """;
        return QueryAsync<ReliabilityPoint>(Sql, new DynamicParameters(), cancellationToken);
    }

    public async Task<LocationChangeReport> GetLocationChangesAsync(CancellationToken cancellationToken)
    {
        const string WindowSql = """
            SELECT
                (last_month - make_interval(months => @Months - 1))::date      AS current_from,
                (last_month + INTERVAL '1 month' - INTERVAL '1 day')::date      AS current_to,
                (last_month - make_interval(months => 2 * @Months - 1))::date  AS previous_from,
                (last_month - make_interval(months => @Months - 1) - INTERVAL '1 day')::date AS previous_to
            FROM (SELECT MAX(month) AS last_month FROM traffic.load_audit) AS bounds
            WHERE last_month IS NOT NULL
            """;

        const string LocationsSql = """
            WITH measured AS (
                SELECT
                    d.location_id,
                    SUM(d.peak_speed_volume) FILTER (WHERE d.date_key >= @CurrentFrom)::numeric
                        / NULLIF(SUM(d.peak_vehicles) FILTER (WHERE d.date_key >= @CurrentFrom), 0)  AS current_speed,
                    SUM(d.peak_speed_volume) FILTER (WHERE d.date_key <= @PreviousTo)::numeric
                        / NULLIF(SUM(d.peak_vehicles) FILTER (WHERE d.date_key <= @PreviousTo), 0)   AS previous_speed,
                    SUM(d.peak_hours) FILTER (WHERE d.date_key >= @CurrentFrom)    AS current_hours,
                    SUM(d.peak_hours) FILTER (WHERE d.date_key <= @PreviousTo)     AS previous_hours,
                    SUM(d.peak_vehicles) FILTER (WHERE d.date_key >= @CurrentFrom) AS current_vehicles,
                    SUM(d.peak_vehicles) FILTER (WHERE d.date_key <= @PreviousTo)  AS previous_vehicles
                FROM traffic.agg_location_daily AS d
                WHERE d.date_key BETWEEN @PreviousFrom AND @CurrentTo
                  AND d.peak_hours > 0
                GROUP BY d.location_id
            ),
            covered AS (
                SELECT
                    *,
                    MAX(current_hours) OVER ()  AS max_current_hours,
                    MAX(previous_hours) OVER () AS max_previous_hours
                FROM measured
            )
            SELECT
                l.geohash,
                ROUND(l.latitude::numeric, 5)              AS latitude,
                ROUND(l.longitude::numeric, 5)             AS longitude,
                ROUND(m.previous_speed, 2)                 AS previous_peak_speed_kmh,
                ROUND(m.current_speed, 2)                  AS current_peak_speed_kmh,
                ROUND(m.current_speed - m.previous_speed, 2) AS speed_change_kmh,
                ROUND(
                    100.0 * ((m.current_vehicles::numeric / m.current_hours)
                           / NULLIF(m.previous_vehicles::numeric / m.previous_hours, 0) - 1), 1
                )                                          AS peak_volume_change_pct
            FROM covered AS m
            JOIN traffic.dim_location AS l USING (location_id)
            WHERE m.current_hours >= GREATEST(@MinimumHours, @MinimumShare * m.max_current_hours)
              AND m.previous_hours >= GREATEST(@MinimumHours, @MinimumShare * m.max_previous_hours)
            ORDER BY speed_change_kmh, l.geohash
            """;

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var window = await connection.QuerySingleOrDefaultAsync<ComparisonWindow>(
            new CommandDefinition(WindowSql, new { Months = TrafficRules.ComparisonWindowMonths }, cancellationToken: cancellationToken));
        if (window is null)
        {
            return new LocationChangeReport(null, null, null, null, []);
        }

        var parameters = new DynamicParameters();
        parameters.Add("CurrentFrom", window.CurrentFrom, System.Data.DbType.Date);
        parameters.Add("CurrentTo", window.CurrentTo, System.Data.DbType.Date);
        parameters.Add("PreviousFrom", window.PreviousFrom, System.Data.DbType.Date);
        parameters.Add("PreviousTo", window.PreviousTo, System.Data.DbType.Date);
        parameters.Add("MinimumHours", TrafficRules.MinimumComparisonPeakHours);
        parameters.Add("MinimumShare", TrafficRules.MinimumComparisonCoverage);

        var rows = await connection.QueryAsync<LocationChange>(
            new CommandDefinition(LocationsSql, parameters, cancellationToken: cancellationToken));

        return new LocationChangeReport(window.CurrentFrom, window.CurrentTo, window.PreviousFrom, window.PreviousTo, rows.AsList());
    }

    private async Task<IReadOnlyList<T>> QueryAsync<T>(string sql, DynamicParameters parameters, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var rows = await connection.QueryAsync<T>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
        return rows.AsList();
    }

    internal sealed record ComparisonWindow
    {
        public DateOnly CurrentFrom { get; init; }

        public DateOnly CurrentTo { get; init; }

        public DateOnly PreviousFrom { get; init; }

        public DateOnly PreviousTo { get; init; }
    }
}
