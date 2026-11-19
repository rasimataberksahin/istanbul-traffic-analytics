-- Weekday evening peak of every cell: latest twelve loaded months against the twelve before.
-- Each cell is compared with itself, so changes in which cells report in a given hour cannot bias the result.
WITH bounds AS (
    SELECT MAX(month) AS last_month FROM traffic.load_audit
),
windows AS (
    SELECT
        (last_month - INTERVAL '11 months')::date AS current_from,
        (last_month - INTERVAL '23 months')::date AS previous_from,
        (last_month + INTERVAL '1 month')::date   AS end_exclusive
    FROM bounds
),
measured AS (
    SELECT
        d.location_id,
        SUM(d.peak_speed_volume) FILTER (WHERE d.date_key >= w.current_from)::numeric
            / NULLIF(SUM(d.peak_vehicles) FILTER (WHERE d.date_key >= w.current_from), 0) AS current_speed,
        SUM(d.peak_speed_volume) FILTER (WHERE d.date_key < w.current_from)::numeric
            / NULLIF(SUM(d.peak_vehicles) FILTER (WHERE d.date_key < w.current_from), 0)  AS previous_speed,
        SUM(d.peak_hours) FILTER (WHERE d.date_key >= w.current_from) AS current_hours,
        SUM(d.peak_hours) FILTER (WHERE d.date_key < w.current_from)  AS previous_hours
    FROM traffic.agg_location_daily AS d
    CROSS JOIN windows AS w
    WHERE d.date_key >= w.previous_from AND d.date_key < w.end_exclusive
    GROUP BY d.location_id
),
covered AS (
    SELECT *
    FROM measured
    WHERE current_hours >= 0.5 * (SELECT MAX(current_hours) FROM measured)
      AND previous_hours >= 0.5 * (SELECT MAX(previous_hours) FROM measured)
)
SELECT
    COUNT(*)                                                                   AS compared_cells,
    ROUND(AVG(current_speed - previous_speed), 2)                              AS mean_change_kmh,
    ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY current_speed - previous_speed))::numeric, 2) AS median_change_kmh,
    ROUND(100.0 * COUNT(*) FILTER (WHERE current_speed - previous_speed < -1) / NULLIF(COUNT(*), 0), 1) AS slower_share_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE current_speed - previous_speed > 1) / NULLIF(COUNT(*), 0), 1)  AS faster_share_pct
FROM covered;
