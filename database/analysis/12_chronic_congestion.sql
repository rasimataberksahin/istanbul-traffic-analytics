-- Soru: Hafta içi zirve saatlerinde kendi serbest akış hızının en sık altına düşen hücreler hangileri?
-- Teknik: Birden fazla CTE, JOIN, HAVING, PERCENTILE_CONT, DENSE_RANK
-- Tanım: Tıkalı saat = ortalama hızın, hücrenin 01:00-04:59 hızının yarısından düşük olduğu saat
WITH free_flow AS (
    SELECT
        location_id,
        SUM(speed_volume)::numeric / SUM(vehicle_count) AS speed_kmh
    FROM traffic.fact_traffic_hourly
    WHERE is_analysis_eligible
      AND NOT is_low_sample
      AND hour_of_day BETWEEN 1 AND 4
    GROUP BY location_id
    HAVING COUNT(*) >= 30
),
peak_hours AS (
    SELECT
        f.location_id,
        ff.speed_kmh                                                 AS free_flow_speed_kmh,
        COUNT(*)                                                     AS observed_hours,
        COUNT(*) FILTER (WHERE f.avg_speed_kmh < 0.5 * ff.speed_kmh) AS congested_hours,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.avg_speed_kmh) AS median_peak_speed_kmh
    FROM traffic.fact_traffic_hourly AS f
    JOIN free_flow AS ff USING (location_id)
    WHERE f.is_analysis_eligible
      AND NOT f.is_low_sample
      AND NOT f.is_weekend
      AND NOT f.is_public_holiday
      AND (f.hour_of_day BETWEEN 7 AND 9 OR f.hour_of_day BETWEEN 17 AND 19)
    GROUP BY f.location_id, ff.speed_kmh
    HAVING COUNT(*) >= 60
),
ranked AS (
    SELECT
        *,
        ROUND(100.0 * congested_hours / observed_hours, 1) AS congested_share_pct,
        DENSE_RANK() OVER (
            ORDER BY ROUND(100.0 * congested_hours / observed_hours, 1) DESC
        ) AS congestion_rank
    FROM peak_hours
)
SELECT
    r.congestion_rank,
    l.geohash,
    ROUND(l.latitude::numeric, 5)   AS latitude,
    ROUND(l.longitude::numeric, 5)  AS longitude,
    ROUND(r.free_flow_speed_kmh, 2) AS free_flow_speed_kmh,
    r.median_peak_speed_kmh,
    r.observed_hours,
    r.congested_hours,
    r.congested_share_pct
FROM ranked AS r
JOIN traffic.dim_location AS l USING (location_id)
ORDER BY r.congestion_rank, r.median_peak_speed_kmh, l.geohash
LIMIT 15;
