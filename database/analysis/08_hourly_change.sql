-- Soru: Hafta içi hız ve araç yoğunluğu saatten saate nasıl değişiyor?
-- Teknik: CTE, LAG
WITH hourly AS (
    SELECT
        hour_of_day,
        SUM(vehicle_count)                                        AS vehicle_observations,
        ROUND(SUM(speed_volume)::numeric / SUM(vehicle_count), 2) AS weighted_avg_speed_kmh
    FROM traffic.fact_traffic_hourly
    WHERE is_analysis_eligible
      AND NOT is_weekend
      AND NOT is_public_holiday
    GROUP BY hour_of_day
)
SELECT
    hour_of_day,
    weighted_avg_speed_kmh,
    weighted_avg_speed_kmh - LAG(weighted_avg_speed_kmh) OVER (ORDER BY hour_of_day) AS speed_change_kmh,
    ROUND(
        100.0 * (vehicle_observations - LAG(vehicle_observations) OVER (ORDER BY hour_of_day))
        / LAG(vehicle_observations) OVER (ORDER BY hour_of_day),
        1
    ) AS vehicle_change_pct
FROM hourly
ORDER BY hour_of_day;
