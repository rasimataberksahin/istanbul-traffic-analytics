-- Soru: Kalite işaretleri verinin ne kadarını etkiliyor?
-- Teknik: CROSS JOIN LATERAL ile sütunları satıra çevirme, pencere fonksiyonu
WITH totals AS (
    SELECT
        COUNT(*)                                       AS total_rows,
        COUNT(*) FILTER (WHERE is_low_sample)          AS low_sample,
        COUNT(*) FILTER (WHERE is_speed_outlier)       AS speed_outlier,
        COUNT(*) FILTER (WHERE is_max_speed_suspect)   AS max_speed_suspect,
        COUNT(*) FILTER (WHERE is_partial_hour)        AS partial_hour,
        COUNT(*) FILTER (WHERE is_public_holiday)      AS public_holiday,
        COUNT(*) FILTER (WHERE is_analysis_eligible)   AS analysis_eligible
    FROM traffic.fact_traffic_hourly
)
SELECT
    flag.name                                          AS quality_flag,
    flag.row_count,
    ROUND(100.0 * flag.row_count / t.total_rows, 3)    AS row_share_pct
FROM totals AS t
CROSS JOIN LATERAL (
    VALUES
        ('analysis_eligible', t.analysis_eligible),
        ('low_sample', t.low_sample),
        ('public_holiday', t.public_holiday),
        ('partial_hour', t.partial_hour),
        ('max_speed_suspect', t.max_speed_suspect),
        ('speed_outlier', t.speed_outlier)
) AS flag (name, row_count)
ORDER BY flag.row_count DESC;
