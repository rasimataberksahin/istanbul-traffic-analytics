-- Soru: Günlük hız ay boyunca nasıl değişti?
-- Teknik: JOIN, LAG, 7 günlük hareketli ortalama
WITH daily AS (
    SELECT
        d.date_key,
        d.day_name,
        BOOL_OR(f.is_public_holiday)                                  AS has_public_holiday,
        ROUND(SUM(f.speed_volume)::numeric / SUM(f.vehicle_count), 2) AS weighted_avg_speed_kmh
    FROM traffic.fact_traffic_hourly AS f
    JOIN traffic.dim_date AS d USING (date_key)
    WHERE f.is_analysis_eligible
    GROUP BY d.date_key, d.day_name
)
SELECT
    date_key,
    day_name,
    has_public_holiday,
    weighted_avg_speed_kmh,
    weighted_avg_speed_kmh - LAG(weighted_avg_speed_kmh) OVER (ORDER BY date_key) AS change_from_previous_day,
    ROUND(
        AVG(weighted_avg_speed_kmh) OVER (ORDER BY date_key ROWS BETWEEN 6 PRECEDING AND CURRENT ROW),
        2
    ) AS moving_avg_7_day_kmh
FROM daily
ORDER BY date_key;
