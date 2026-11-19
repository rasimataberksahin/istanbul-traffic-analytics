-- Soru: Şehrin genel trafik göstergeleri nedir?
-- Teknik: Koşullu toplama (FILTER)
SELECT
    COUNT(*)                                          AS total_rows,
    COUNT(*) FILTER (WHERE is_analysis_eligible)      AS eligible_rows,
    COUNT(DISTINCT location_id)                       AS locations,
    MIN(observed_at)                                  AS first_hour,
    MAX(observed_at)                                  AS last_hour,
    ROUND(AVG(avg_speed_kmh) FILTER (WHERE is_analysis_eligible), 2) AS simple_avg_speed_kmh,
    ROUND(
        SUM(speed_volume) FILTER (WHERE is_analysis_eligible)::numeric
        / SUM(vehicle_count) FILTER (WHERE is_analysis_eligible),
        2
    )                                                 AS weighted_avg_speed_kmh
FROM traffic.fact_traffic_hourly;
