-- Monthly city indicators from the hourly aggregate layer.
-- Volume is compared per cell and hour because the number of measured cells changes over time.
SELECT
    date_trunc('month', observed_at)::date                                  AS month,
    COUNT(*) FILTER (WHERE vehicle_count > 0)                               AS observed_hours,
    ROUND(SUM(vehicle_count)::numeric / NULLIF(SUM(eligible_row_count), 0), 1) AS vehicles_per_cell_hour,
    ROUND(SUM(speed_volume)::numeric / NULLIF(SUM(vehicle_count), 0), 2)    AS weighted_speed_kmh,
    ROUND(
        SUM(speed_volume) FILTER (WHERE NOT is_weekend AND NOT is_public_holiday AND hour_of_day BETWEEN 17 AND 19)::numeric
        / NULLIF(SUM(vehicle_count) FILTER (WHERE NOT is_weekend AND NOT is_public_holiday AND hour_of_day BETWEEN 17 AND 19), 0), 2
    )                                                                       AS evening_peak_speed_kmh,
    ROUND(
        SUM(speed_volume) FILTER (WHERE hour_of_day BETWEEN 1 AND 4)::numeric
        / NULLIF(SUM(vehicle_count) FILTER (WHERE hour_of_day BETWEEN 1 AND 4), 0), 2
    )                                                                       AS night_speed_kmh
FROM traffic.agg_city_hourly
GROUP BY 1
ORDER BY 1;
