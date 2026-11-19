-- Star schema for hourly traffic observations.
-- Every statement is idempotent, so the file can be applied on each load.

CREATE SCHEMA IF NOT EXISTS traffic;

CREATE TABLE IF NOT EXISTS traffic.dim_location (
    location_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    geohash     char(6)          NOT NULL UNIQUE,
    latitude    double precision NOT NULL CHECK (latitude BETWEEN 40.70 AND 41.70),
    longitude   double precision NOT NULL CHECK (longitude BETWEEN 27.90 AND 29.95)
);

CREATE TABLE IF NOT EXISTS traffic.dim_date (
    date_key        date     PRIMARY KEY,
    year            smallint NOT NULL,
    month           smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
    day             smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
    iso_day_of_week smallint NOT NULL CHECK (iso_day_of_week BETWEEN 1 AND 7),
    day_name        text     NOT NULL,
    is_weekend      boolean  NOT NULL
);

CREATE TABLE IF NOT EXISTS traffic.fact_traffic_hourly (
    observed_at          timestamp(0) NOT NULL,
    location_id          integer      NOT NULL REFERENCES traffic.dim_location (location_id),
    date_key             date         GENERATED ALWAYS AS (observed_at::date) STORED
                                      REFERENCES traffic.dim_date (date_key),
    hour_of_day          smallint     GENERATED ALWAYS AS (EXTRACT(HOUR FROM observed_at)::smallint) STORED,
    min_speed_kmh        smallint     NOT NULL,
    max_speed_kmh        smallint     NOT NULL,
    avg_speed_kmh        smallint     NOT NULL,
    vehicle_count        integer      NOT NULL,
    speed_volume         bigint       GENERATED ALWAYS AS (avg_speed_kmh::bigint * vehicle_count) STORED,
    is_weekend           boolean      NOT NULL,
    is_public_holiday    boolean      NOT NULL,
    is_low_sample        boolean      NOT NULL,
    is_speed_outlier     boolean      NOT NULL,
    is_max_speed_suspect boolean      NOT NULL,
    is_partial_hour      boolean      NOT NULL,
    is_analysis_eligible boolean      NOT NULL,
    PRIMARY KEY (observed_at, location_id),
    CONSTRAINT ck_fact_on_the_hour CHECK (date_trunc('hour', observed_at) = observed_at),
    CONSTRAINT ck_fact_speed_order CHECK (min_speed_kmh <= avg_speed_kmh AND avg_speed_kmh <= max_speed_kmh),
    CONSTRAINT ck_fact_speed_range CHECK (min_speed_kmh >= 0 AND max_speed_kmh <= 300),
    CONSTRAINT ck_fact_vehicle_count CHECK (vehicle_count > 0)
) PARTITION BY RANGE (observed_at);

-- Time series of one location.
CREATE INDEX IF NOT EXISTS ix_fact_location_time
    ON traffic.fact_traffic_hourly (location_id, observed_at);

-- Date filters of the dashboard.
CREATE INDEX IF NOT EXISTS ix_fact_date_hour
    ON traffic.fact_traffic_hourly (date_key, hour_of_day);

CREATE TABLE IF NOT EXISTS traffic.load_audit (
    month          date        PRIMARY KEY CHECK (EXTRACT(DAY FROM month) = 1),
    source_file    text        NOT NULL,
    source_sha256  char(64)    NOT NULL,
    row_count      bigint      NOT NULL CHECK (row_count > 0),
    vehicle_total  bigint      NOT NULL CHECK (vehicle_total > 0),
    location_count integer     NOT NULL CHECK (location_count > 0),
    loaded_at      timestamptz NOT NULL DEFAULT now()
);

-- Creates the monthly partition and calendar rows. Safe to call repeatedly.
CREATE OR REPLACE FUNCTION traffic.ensure_month(p_month date)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_next_month date := (p_month + INTERVAL '1 month')::date;
    v_partition  text := format('fact_traffic_hourly_y%sm%s', to_char(p_month, 'YYYY'), to_char(p_month, 'MM'));
BEGIN
    IF EXTRACT(DAY FROM p_month) <> 1 THEN
        RAISE EXCEPTION 'p_month must be the first day of a month: %', p_month;
    END IF;

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS traffic.%I PARTITION OF traffic.fact_traffic_hourly
         FOR VALUES FROM (%L) TO (%L)',
        v_partition, p_month::timestamp, v_next_month::timestamp
    );

    INSERT INTO traffic.dim_date (date_key, year, month, day, iso_day_of_week, day_name, is_weekend)
    SELECT d::date,
           EXTRACT(YEAR FROM d)::smallint,
           EXTRACT(MONTH FROM d)::smallint,
           EXTRACT(DAY FROM d)::smallint,
           EXTRACT(ISODOW FROM d)::smallint,
           (ARRAY['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'])[EXTRACT(ISODOW FROM d)::int],
           EXTRACT(ISODOW FROM d) >= 6
    FROM generate_series(p_month::timestamp, v_next_month::timestamp - INTERVAL '1 day', INTERVAL '1 day') AS d
    ON CONFLICT (date_key) DO NOTHING;

    RETURN v_partition;
END;
$$;
