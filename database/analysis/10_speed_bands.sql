-- Soru: Araç gözlemleri hız bantlarına nasıl dağılıyor?
-- Teknik: CASE, GROUP BY, pay hesabı için pencere fonksiyonu
WITH banded AS (
    SELECT
        CASE
            WHEN avg_speed_kmh < 20 THEN 1
            WHEN avg_speed_kmh < 40 THEN 2
            WHEN avg_speed_kmh < 60 THEN 3
            WHEN avg_speed_kmh < 80 THEN 4
            ELSE 5
        END AS band_order,
        vehicle_count
    FROM traffic.fact_traffic_hourly
    WHERE is_analysis_eligible
)
SELECT
    band_order,
    (ARRAY['0-19 km/sa', '20-39 km/sa', '40-59 km/sa', '60-79 km/sa', '80+ km/sa'])[band_order] AS speed_band,
    COUNT(*)                                                       AS cell_hours,
    SUM(vehicle_count)                                             AS vehicle_observations,
    ROUND(100.0 * SUM(vehicle_count) / SUM(SUM(vehicle_count)) OVER (), 2) AS vehicle_share_pct
FROM banded
GROUP BY band_order
ORDER BY band_order;
