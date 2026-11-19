-- Soru: Hafta içi ve hafta sonu hızları saat bazında nasıl ayrışıyor?
-- Teknik: CTE, koşullu toplama (FILTER)
WITH by_hour AS (
    SELECT
        hour_of_day,
        ROUND(
            SUM(speed_volume) FILTER (WHERE NOT is_weekend)::numeric
            / SUM(vehicle_count) FILTER (WHERE NOT is_weekend),
            2
        ) AS weekday_speed_kmh,
        ROUND(
            SUM(speed_volume) FILTER (WHERE is_weekend)::numeric
            / SUM(vehicle_count) FILTER (WHERE is_weekend),
            2
        ) AS weekend_speed_kmh
    FROM traffic.fact_traffic_hourly
    WHERE is_analysis_eligible
      AND NOT is_public_holiday
    GROUP BY hour_of_day
)
SELECT
    hour_of_day,
    weekday_speed_kmh,
    weekend_speed_kmh,
    weekend_speed_kmh - weekday_speed_kmh AS weekend_advantage_kmh
FROM by_hour
ORDER BY hour_of_day;
