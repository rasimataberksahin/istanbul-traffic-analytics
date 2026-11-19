-- Soru: Serbest akışa göre hızı en çok düşen hücreler hangileri?
-- Teknik: Birden fazla CTE, JOIN, HAVING
-- Tanım: Tıkanıklık endeksi = 1 - (akşam zirvesi hızı / gece 01:00-04:59 hızı)
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
evening_peak AS (
    SELECT
        location_id,
        AVG(vehicle_count)                              AS avg_vehicle_count,
        SUM(speed_volume)::numeric / SUM(vehicle_count) AS speed_kmh
    FROM traffic.fact_traffic_hourly
    WHERE is_analysis_eligible
      AND NOT is_low_sample
      AND NOT is_weekend
      AND NOT is_public_holiday
      AND hour_of_day BETWEEN 17 AND 19
    GROUP BY location_id
    HAVING COUNT(*) >= 30
)
SELECT
    l.geohash,
    ROUND(l.latitude::numeric, 5)                   AS latitude,
    ROUND(l.longitude::numeric, 5)                  AS longitude,
    ROUND(p.avg_vehicle_count, 1)                   AS avg_peak_vehicle_count,
    ROUND(f.speed_kmh, 2)                           AS free_flow_speed_kmh,
    ROUND(p.speed_kmh, 2)                           AS peak_speed_kmh,
    ROUND(1 - p.speed_kmh / f.speed_kmh, 3)         AS congestion_index
FROM free_flow AS f
JOIN evening_peak AS p USING (location_id)
JOIN traffic.dim_location AS l USING (location_id)
ORDER BY congestion_index DESC, l.geohash
LIMIT 15;
