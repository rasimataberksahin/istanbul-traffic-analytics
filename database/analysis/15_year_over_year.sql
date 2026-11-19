-- Evening peak of each month against the same month one year earlier.
-- LAG over a gap-free month series keeps the comparison correct when a month is missing.
WITH months AS (
    SELECT generate_series(
        date_trunc('month', MIN(observed_at)),
        date_trunc('month', MAX(observed_at)),
        INTERVAL '1 month'
    )::date AS month
    FROM traffic.agg_city_hourly
),
evening AS (
    SELECT
        date_trunc('month', observed_at)::date AS month,
        SUM(speed_volume)::numeric / NULLIF(SUM(vehicle_count), 0) AS speed_kmh
    FROM traffic.agg_city_hourly
    WHERE vehicle_count > 0
      AND NOT is_weekend
      AND NOT is_public_holiday
      AND hour_of_day BETWEEN 17 AND 19
    GROUP BY 1
),
series AS (
    SELECT m.month, e.speed_kmh, LAG(e.speed_kmh, 12) OVER (ORDER BY m.month) AS speed_year_before
    FROM months AS m
    LEFT JOIN evening AS e USING (month)
)
SELECT
    month,
    ROUND(speed_kmh, 2)                     AS evening_peak_speed_kmh,
    ROUND(speed_year_before, 2)             AS same_month_last_year_kmh,
    ROUND(speed_kmh - speed_year_before, 2) AS change_kmh
FROM series
WHERE speed_kmh IS NOT NULL
ORDER BY month;
