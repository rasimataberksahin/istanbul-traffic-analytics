-- Weekday hourly profile of the school term, school breaks, summer break and Ramadan.
-- The slowest afternoon hour of each period is ranked with a window function.
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
),
profile AS (
    SELECT
        c.period,
        f.hour_of_day,
        COUNT(DISTINCT f.date_key) AS days,
        SUM(f.speed_volume)::numeric / NULLIF(SUM(f.vehicle_count), 0)        AS speed_kmh,
        SUM(f.vehicle_count)::numeric / NULLIF(SUM(f.eligible_row_count), 0)  AS vehicles_per_cell_hour
    FROM traffic.agg_city_hourly AS f
    JOIN classified AS c USING (date_key)
    WHERE f.vehicle_count > 0 AND NOT f.is_public_holiday
    GROUP BY c.period, f.hour_of_day
)
SELECT
    period,
    hour_of_day,
    days,
    ROUND(speed_kmh, 2)              AS speed_kmh,
    ROUND(vehicles_per_cell_hour, 1) AS vehicles_per_cell_hour,
    CASE
        WHEN hour_of_day >= 12
        THEN RANK() OVER (PARTITION BY period, hour_of_day >= 12 ORDER BY speed_kmh)
    END                              AS afternoon_slowness_rank
FROM profile
ORDER BY period, hour_of_day;
