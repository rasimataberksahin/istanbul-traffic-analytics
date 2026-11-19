-- Soru: Hafta içi akşam zirvesinde en yavaş hücreler hangileri?
-- Teknik: JOIN, GROUP BY, HAVING, ROW_NUMBER
-- Not: Düşük örneklemli satırlar çıkarılır, hücre başına en az 30 saat gözlem aranır.
WITH peak AS (
    SELECT
        f.location_id,
        COUNT(*)                                                    AS observed_hours,
        ROUND(AVG(f.vehicle_count), 1)                              AS avg_vehicle_count,
        ROUND(SUM(f.speed_volume)::numeric / SUM(f.vehicle_count), 2) AS weighted_avg_speed_kmh
    FROM traffic.fact_traffic_hourly AS f
    WHERE f.is_analysis_eligible
      AND NOT f.is_low_sample
      AND NOT f.is_weekend
      AND NOT f.is_public_holiday
      AND f.hour_of_day BETWEEN 17 AND 19
    GROUP BY f.location_id
    HAVING COUNT(*) >= 30
),
ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (ORDER BY weighted_avg_speed_kmh ASC, location_id ASC) AS slowest_rank
    FROM peak
)
SELECT
    r.slowest_rank,
    l.geohash,
    ROUND(l.latitude::numeric, 5)  AS latitude,
    ROUND(l.longitude::numeric, 5) AS longitude,
    r.observed_hours,
    r.avg_vehicle_count,
    r.weighted_avg_speed_kmh
FROM ranked AS r
JOIN traffic.dim_location AS l USING (location_id)
WHERE r.slowest_rank <= 15
ORDER BY r.slowest_rank;
