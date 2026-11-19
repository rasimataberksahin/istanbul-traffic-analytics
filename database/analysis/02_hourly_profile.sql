-- Soru: Günün hangi saatleri en yavaş?
-- Teknik: CTE, GROUP BY, RANK
WITH hourly AS (
    SELECT
        hour_of_day,
        SUM(vehicle_count)                                  AS vehicle_observations,
        ROUND(SUM(speed_volume)::numeric / SUM(vehicle_count), 2) AS weighted_avg_speed_kmh
    FROM traffic.fact_traffic_hourly
    WHERE is_analysis_eligible
      AND NOT is_public_holiday
    GROUP BY hour_of_day
)
SELECT
    hour_of_day,
    vehicle_observations,
    weighted_avg_speed_kmh,
    RANK() OVER (ORDER BY weighted_avg_speed_kmh ASC) AS slowest_rank
FROM hourly
ORDER BY hour_of_day;
