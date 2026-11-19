-- Calendar periods and the aggregate layer read by the API.
-- The loader refreshes the aggregates of a month in the same transaction that
-- replaces its facts, so the two layers can never disagree.

CREATE TABLE IF NOT EXISTS traffic.calendar_period (
    period_code text PRIMARY KEY,
    kind        text NOT NULL CHECK (kind IN ('public_holiday', 'ramadan', 'school_break', 'summer_break')),
    name        text NOT NULL,
    start_date  date NOT NULL,
    end_date    date NOT NULL,
    CONSTRAINT ck_calendar_period_order CHECK (end_date >= start_date)
);

-- Public holidays mirror traffic_etl.holidays (full days only, eve half days are
-- flagged per hour by the ETL). School dates follow the MEB academic calendar.
INSERT INTO traffic.calendar_period (period_code, kind, name, start_date, end_date) VALUES
    ('2023-new-year',     'public_holiday', 'Yılbaşı',                        '2023-01-01', '2023-01-01'),
    ('2023-ramadan-feast','public_holiday', 'Ramazan Bayramı ve 23 Nisan',    '2023-04-21', '2023-04-23'),
    ('2023-labour-day',   'public_holiday', '1 Mayıs',                        '2023-05-01', '2023-05-01'),
    ('2023-youth-day',    'public_holiday', '19 Mayıs',                       '2023-05-19', '2023-05-19'),
    ('2023-sacrifice',    'public_holiday', 'Kurban Bayramı',                 '2023-06-28', '2023-07-01'),
    ('2023-democracy',    'public_holiday', '15 Temmuz',                      '2023-07-15', '2023-07-15'),
    ('2023-victory',      'public_holiday', '30 Ağustos',                     '2023-08-30', '2023-08-30'),
    ('2023-republic',     'public_holiday', '29 Ekim',                        '2023-10-29', '2023-10-29'),
    ('2024-new-year',     'public_holiday', 'Yılbaşı',                        '2024-01-01', '2024-01-01'),
    ('2024-ramadan-feast','public_holiday', 'Ramazan Bayramı',                '2024-04-10', '2024-04-12'),
    ('2024-sovereignty',  'public_holiday', '23 Nisan',                       '2024-04-23', '2024-04-23'),
    ('2024-labour-day',   'public_holiday', '1 Mayıs',                        '2024-05-01', '2024-05-01'),
    ('2024-youth-day',    'public_holiday', '19 Mayıs',                       '2024-05-19', '2024-05-19'),
    ('2024-sacrifice',    'public_holiday', 'Kurban Bayramı',                 '2024-06-16', '2024-06-19'),
    ('2024-democracy',    'public_holiday', '15 Temmuz',                      '2024-07-15', '2024-07-15'),
    ('2024-victory',      'public_holiday', '30 Ağustos',                     '2024-08-30', '2024-08-30'),
    ('2024-republic',     'public_holiday', '29 Ekim',                        '2024-10-29', '2024-10-29'),
    ('2025-new-year',     'public_holiday', 'Yılbaşı',                        '2025-01-01', '2025-01-01'),
    ('2025-ramadan-feast','public_holiday', 'Ramazan Bayramı',                '2025-03-30', '2025-04-01'),
    ('2025-sovereignty',  'public_holiday', '23 Nisan',                       '2025-04-23', '2025-04-23'),
    ('2025-labour-day',   'public_holiday', '1 Mayıs',                        '2025-05-01', '2025-05-01'),
    ('2025-youth-day',    'public_holiday', '19 Mayıs',                       '2025-05-19', '2025-05-19'),
    ('2025-sacrifice',    'public_holiday', 'Kurban Bayramı',                 '2025-06-06', '2025-06-09'),
    ('2025-democracy',    'public_holiday', '15 Temmuz',                      '2025-07-15', '2025-07-15'),
    ('2025-victory',      'public_holiday', '30 Ağustos',                     '2025-08-30', '2025-08-30'),
    ('2025-republic',     'public_holiday', '29 Ekim',                        '2025-10-29', '2025-10-29'),
    ('2023-ramadan',      'ramadan',        'Ramazan 2023',                   '2023-03-23', '2023-04-20'),
    ('2024-ramadan',      'ramadan',        'Ramazan 2024',                   '2024-03-11', '2024-04-09'),
    ('2025-ramadan',      'ramadan',        'Ramazan 2025',                   '2025-03-01', '2025-03-29'),
    ('2023-semester',     'school_break',   'Yarıyıl tatili 2023',            '2023-01-21', '2023-02-19'),
    ('2023-autumn-break', 'school_break',   'Ara tatil Kasım 2023',           '2023-11-11', '2023-11-19'),
    ('2024-semester',     'school_break',   'Yarıyıl tatili 2024',            '2024-01-20', '2024-02-04'),
    ('2024-spring-break', 'school_break',   'Ara tatil Nisan 2024',           '2024-04-06', '2024-04-14'),
    ('2024-autumn-break', 'school_break',   'Ara tatil Kasım 2024',           '2024-11-09', '2024-11-17'),
    ('2025-semester',     'school_break',   'Yarıyıl tatili 2025',            '2025-01-18', '2025-02-02'),
    ('2023-summer',       'summer_break',   'Yaz tatili 2023',                '2023-06-17', '2023-09-10'),
    ('2024-summer',       'summer_break',   'Yaz tatili 2024',                '2024-06-15', '2024-09-08')
ON CONFLICT (period_code) DO UPDATE
SET kind = EXCLUDED.kind,
    name = EXCLUDED.name,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date;

-- One row per hour of the city. Sums cover analysis-eligible rows only.
CREATE TABLE IF NOT EXISTS traffic.agg_city_hourly (
    observed_at        timestamp(0) PRIMARY KEY,
    date_key           date     NOT NULL REFERENCES traffic.dim_date (date_key),
    hour_of_day        smallint NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
    is_weekend         boolean  NOT NULL,
    is_public_holiday  boolean  NOT NULL,
    is_partial_hour    boolean  NOT NULL,
    row_count          integer  NOT NULL,
    eligible_row_count integer  NOT NULL,
    location_count     integer  NOT NULL,
    vehicle_count      bigint   NOT NULL,
    speed_volume       bigint   NOT NULL,
    avg_speed_sum      bigint   NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_agg_city_hourly_date ON traffic.agg_city_hourly (date_key, hour_of_day);

-- Vehicle-weighted speed distribution of each hour.
CREATE TABLE IF NOT EXISTS traffic.agg_city_speed_band (
    observed_at   timestamp(0) NOT NULL REFERENCES traffic.agg_city_hourly (observed_at) ON DELETE CASCADE,
    band_order    smallint     NOT NULL CHECK (band_order BETWEEN 1 AND 5),
    row_count     integer      NOT NULL,
    vehicle_count bigint       NOT NULL,
    PRIMARY KEY (observed_at, band_order)
);

-- One row per location and day. Night and peak sums exclude low-sample rows and
-- use the rules of TrafficRules: night 01-04, weekday evening peak 17-19.
CREATE TABLE IF NOT EXISTS traffic.agg_location_daily (
    date_key           date     NOT NULL REFERENCES traffic.dim_date (date_key),
    location_id        integer  NOT NULL REFERENCES traffic.dim_location (location_id),
    observed_hours     smallint NOT NULL,
    weekday_hours      smallint NOT NULL,
    weekend_hours      smallint NOT NULL,
    holiday_hours      smallint NOT NULL,
    vehicle_count      integer  NOT NULL,
    speed_volume       bigint   NOT NULL,
    night_hours        smallint NOT NULL,
    night_vehicles     integer  NOT NULL,
    night_speed_volume bigint   NOT NULL,
    peak_hours         smallint NOT NULL,
    peak_vehicles      integer  NOT NULL,
    peak_speed_volume  bigint   NOT NULL,
    PRIMARY KEY (date_key, location_id)
);

CREATE OR REPLACE FUNCTION traffic.refresh_month_aggregates(p_month date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_from timestamp := p_month::timestamp;
    v_to   timestamp := (p_month + INTERVAL '1 month')::timestamp;
BEGIN
    DELETE FROM traffic.agg_city_hourly WHERE observed_at >= v_from AND observed_at < v_to;
    DELETE FROM traffic.agg_location_daily WHERE date_key >= v_from::date AND date_key < v_to::date;

    INSERT INTO traffic.agg_city_hourly (
        observed_at, date_key, hour_of_day, is_weekend, is_public_holiday, is_partial_hour,
        row_count, eligible_row_count, location_count, vehicle_count, speed_volume, avg_speed_sum
    )
    SELECT
        f.observed_at,
        MIN(f.date_key),
        MIN(f.hour_of_day),
        BOOL_OR(f.is_weekend),
        BOOL_OR(f.is_public_holiday),
        BOOL_OR(f.is_partial_hour),
        COUNT(*),
        COUNT(*) FILTER (WHERE f.is_analysis_eligible),
        COUNT(DISTINCT f.location_id) FILTER (WHERE f.is_analysis_eligible),
        COALESCE(SUM(f.vehicle_count) FILTER (WHERE f.is_analysis_eligible), 0),
        COALESCE(SUM(f.speed_volume) FILTER (WHERE f.is_analysis_eligible), 0),
        COALESCE(SUM(f.avg_speed_kmh) FILTER (WHERE f.is_analysis_eligible), 0)
    FROM traffic.fact_traffic_hourly AS f
    WHERE f.observed_at >= v_from AND f.observed_at < v_to
    GROUP BY f.observed_at;

    INSERT INTO traffic.agg_city_speed_band (observed_at, band_order, row_count, vehicle_count)
    SELECT
        f.observed_at,
        CASE
            WHEN f.avg_speed_kmh < 20 THEN 1
            WHEN f.avg_speed_kmh < 40 THEN 2
            WHEN f.avg_speed_kmh < 60 THEN 3
            WHEN f.avg_speed_kmh < 80 THEN 4
            ELSE 5
        END AS band_order,
        COUNT(*),
        SUM(f.vehicle_count)
    FROM traffic.fact_traffic_hourly AS f
    WHERE f.observed_at >= v_from AND f.observed_at < v_to
      AND f.is_analysis_eligible
    GROUP BY f.observed_at, band_order;

    INSERT INTO traffic.agg_location_daily (
        date_key, location_id, observed_hours, weekday_hours, weekend_hours, holiday_hours,
        vehicle_count, speed_volume,
        night_hours, night_vehicles, night_speed_volume,
        peak_hours, peak_vehicles, peak_speed_volume
    )
    SELECT
        f.date_key,
        f.location_id,
        COUNT(*),
        COUNT(*) FILTER (WHERE NOT f.is_weekend AND NOT f.is_public_holiday),
        COUNT(*) FILTER (WHERE f.is_weekend AND NOT f.is_public_holiday),
        COUNT(*) FILTER (WHERE f.is_public_holiday),
        SUM(f.vehicle_count),
        SUM(f.speed_volume),
        COUNT(*) FILTER (WHERE n.is_night),
        COALESCE(SUM(f.vehicle_count) FILTER (WHERE n.is_night), 0),
        COALESCE(SUM(f.speed_volume) FILTER (WHERE n.is_night), 0),
        COUNT(*) FILTER (WHERE n.is_peak),
        COALESCE(SUM(f.vehicle_count) FILTER (WHERE n.is_peak), 0),
        COALESCE(SUM(f.speed_volume) FILTER (WHERE n.is_peak), 0)
    FROM traffic.fact_traffic_hourly AS f
    CROSS JOIN LATERAL (
        SELECT
            NOT f.is_low_sample AND f.hour_of_day BETWEEN 1 AND 4 AS is_night,
            NOT f.is_low_sample AND NOT f.is_weekend AND NOT f.is_public_holiday
                AND f.hour_of_day BETWEEN 17 AND 19 AS is_peak
    ) AS n
    WHERE f.observed_at >= v_from AND f.observed_at < v_to
      AND f.is_analysis_eligible
    GROUP BY f.date_key, f.location_id;
END;
$$;
