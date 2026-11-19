-- Soru: Tam gün resmî tatil, aynı haftanın normal günlerine göre trafiği nasıl değiştiriyor?
-- Teknik: Birden fazla CTE, JOIN, koşullu toplama (FILTER)
WITH holiday_days AS (
    SELECT date_key
    FROM traffic.fact_traffic_hourly
    GROUP BY date_key
    HAVING BOOL_AND(is_public_holiday)
),
comparison AS (
    SELECT
        f.hour_of_day,
        h.date_key IS NOT NULL AS is_holiday,
        f.date_key,
        f.speed_volume,
        f.vehicle_count
    FROM traffic.fact_traffic_hourly AS f
    JOIN traffic.dim_date AS d USING (date_key)
    LEFT JOIN holiday_days AS h USING (date_key)
    WHERE f.is_analysis_eligible
      AND d.iso_day_of_week IN (
          SELECT EXTRACT(ISODOW FROM date_key)::smallint FROM holiday_days
      )
      AND (h.date_key IS NOT NULL OR NOT f.is_public_holiday)
),
by_hour AS (
    SELECT
        hour_of_day,
        SUM(speed_volume) FILTER (WHERE is_holiday)::numeric
            / SUM(vehicle_count) FILTER (WHERE is_holiday)     AS holiday_speed,
        SUM(speed_volume) FILTER (WHERE NOT is_holiday)::numeric
            / SUM(vehicle_count) FILTER (WHERE NOT is_holiday) AS normal_speed,
        SUM(vehicle_count) FILTER (WHERE is_holiday)::numeric
            / COUNT(DISTINCT date_key) FILTER (WHERE is_holiday)     AS holiday_vehicles_per_day,
        SUM(vehicle_count) FILTER (WHERE NOT is_holiday)::numeric
            / COUNT(DISTINCT date_key) FILTER (WHERE NOT is_holiday) AS normal_vehicles_per_day
    FROM comparison
    GROUP BY hour_of_day
)
SELECT
    hour_of_day,
    ROUND(holiday_speed, 2)                 AS holiday_speed_kmh,
    ROUND(normal_speed, 2)                  AS normal_day_speed_kmh,
    ROUND(holiday_speed - normal_speed, 2)  AS speed_gain_kmh,
    ROUND(100 * (holiday_vehicles_per_day - normal_vehicles_per_day) / normal_vehicles_per_day, 1)
                                            AS vehicle_change_pct
FROM by_hour
ORDER BY hour_of_day;
