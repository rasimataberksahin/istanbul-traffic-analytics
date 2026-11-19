-- Soru: Bir hücredeki araç sayısı arttıkça hız nasıl değişiyor?
-- Teknik: NTILE, CORR, CROSS JOIN
WITH observations AS (
    SELECT
        vehicle_count,
        avg_speed_kmh,
        speed_volume,
        NTILE(10) OVER (ORDER BY vehicle_count, observed_at, location_id) AS vehicle_decile
    FROM traffic.fact_traffic_hourly
    WHERE is_analysis_eligible
      AND NOT is_low_sample
),
correlation AS (
    SELECT ROUND(CORR(vehicle_count, avg_speed_kmh)::numeric, 3) AS pearson_r
    FROM observations
)
SELECT
    o.vehicle_decile,
    MIN(o.vehicle_count)                                      AS min_vehicles,
    MAX(o.vehicle_count)                                      AS max_vehicles,
    ROUND(AVG(o.avg_speed_kmh), 2)                            AS simple_avg_speed_kmh,
    ROUND(SUM(o.speed_volume)::numeric / SUM(o.vehicle_count), 2) AS weighted_avg_speed_kmh,
    c.pearson_r                                               AS overall_pearson_r
FROM observations AS o
CROSS JOIN correlation AS c
GROUP BY o.vehicle_decile, c.pearson_r
ORDER BY o.vehicle_decile;
