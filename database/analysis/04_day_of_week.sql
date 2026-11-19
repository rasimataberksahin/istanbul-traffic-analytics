-- Soru: Haftanın en yavaş günü hangisi?
-- Teknik: JOIN, GROUP BY, koşullu toplama (FILTER)
SELECT
    d.iso_day_of_week,
    d.day_name,
    COUNT(DISTINCT d.date_key)                                      AS days_observed,
    ROUND(SUM(f.speed_volume)::numeric / SUM(f.vehicle_count), 2)   AS weighted_avg_speed_kmh,
    ROUND(
        SUM(f.speed_volume) FILTER (WHERE f.hour_of_day BETWEEN 17 AND 19)::numeric
        / SUM(f.vehicle_count) FILTER (WHERE f.hour_of_day BETWEEN 17 AND 19),
        2
    )                                                               AS evening_peak_speed_kmh
FROM traffic.fact_traffic_hourly AS f
JOIN traffic.dim_date AS d USING (date_key)
WHERE f.is_analysis_eligible
  AND NOT f.is_public_holiday
GROUP BY d.iso_day_of_week, d.day_name
ORDER BY d.iso_day_of_week;
