-- Traffic incidents announced by the IBB Traffic Management Centre (UYM), 2013 onwards.
-- Loaded by traffic_etl.incidents as a full replacement of the published history.
CREATE TABLE IF NOT EXISTS traffic.fact_incident (
    incident_id         bigint       PRIMARY KEY,
    started_at          timestamp(0) NOT NULL,
    ended_at            timestamp(0),
    intervened_at       timestamp(0),
    -- NULL when the record was closed before it opened or left open for more than a week.
    duration_min        numeric(8, 1) CHECK (duration_min > 0),
    response_min        numeric(8, 1) CHECK (response_min >= 0),
    category            text         NOT NULL CHECK (category IN (
                            'accident', 'breakdown', 'vehicle_fire', 'roadworks', 'closure',
                            'congestion', 'event', 'weather', 'other')),
    source_type         text         NOT NULL,
    severity            text         CHECK (severity IN ('damage', 'injury', 'chain', 'fatal', 'unknown')),
    title               text         NOT NULL,
    road                text,
    segment             text,
    lane                text         CHECK (lane IN ('left', 'middle', 'right', 'shoulder', 'all')),
    is_side_road        boolean      NOT NULL,
    landmark            text,
    closed_lanes        smallint     CHECK (closed_lanes BETWEEN 1 AND 5),
    latitude            double precision NOT NULL CHECK (latitude BETWEEN 40.70 AND 41.70),
    longitude           double precision NOT NULL CHECK (longitude BETWEEN 27.90 AND 29.95),
    geohash             char(6)      NOT NULL,
    neighborhood        text,
    district            text,
    is_duration_invalid boolean      NOT NULL,
    -- Set when the incident falls in a cell of the hourly traffic data.
    location_id         integer      REFERENCES traffic.dim_location (location_id),
    date_key            date         GENERATED ALWAYS AS (started_at::date) STORED,
    hour_of_day         smallint     GENERATED ALWAYS AS (EXTRACT(HOUR FROM started_at)::smallint) STORED,
    iso_day_of_week     smallint     GENERATED ALWAYS AS (EXTRACT(ISODOW FROM started_at)::smallint) STORED,
    is_weekend          boolean      GENERATED ALWAYS AS (EXTRACT(ISODOW FROM started_at) >= 6) STORED,
    -- Severity only describes accidents.
    CHECK ((category = 'accident') = (severity IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS ix_incident_started ON traffic.fact_incident (started_at);
CREATE INDEX IF NOT EXISTS ix_incident_category_started ON traffic.fact_incident (category, started_at);
CREATE INDEX IF NOT EXISTS ix_incident_geohash ON traffic.fact_incident (geohash, started_at);
CREATE INDEX IF NOT EXISTS ix_incident_location ON traffic.fact_incident (location_id, started_at) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_incident_road ON traffic.fact_incident (road, segment);

CREATE TABLE IF NOT EXISTS traffic.incident_load_audit (
    load_id          integer      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_file      text         NOT NULL,
    source_sha256    char(64)     NOT NULL,
    row_count        integer      NOT NULL,
    first_started_at timestamp(0) NOT NULL,
    last_started_at  timestamp(0) NOT NULL,
    loaded_at        timestamptz  NOT NULL DEFAULT now()
);

-- Speed in the incident's cell from one hour before to three hours after it started,
-- next to the usual speed of that cell in the same month, hour and day type.
CREATE TABLE IF NOT EXISTS traffic.incident_traffic_impact (
    incident_id        bigint   NOT NULL REFERENCES traffic.fact_incident (incident_id) ON DELETE CASCADE,
    offset_hours       smallint NOT NULL CHECK (offset_hours BETWEEN -1 AND 3),
    speed_kmh          numeric(6, 2) NOT NULL,
    baseline_speed_kmh numeric(6, 2) NOT NULL,
    vehicles           integer  NOT NULL,
    baseline_vehicles  numeric(8, 1) NOT NULL,
    PRIMARY KEY (incident_id, offset_hours)
);

CREATE OR REPLACE FUNCTION traffic.refresh_incident_impact()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    TRUNCATE traffic.incident_traffic_impact;

    INSERT INTO traffic.incident_traffic_impact (
        incident_id, offset_hours, speed_kmh, baseline_speed_kmh, vehicles, baseline_vehicles
    )
    WITH bounds AS (
        SELECT MIN(observed_at) AS first_hour, MAX(observed_at) AS last_hour FROM traffic.agg_city_hourly
    ),
    incidents AS (
        SELECT i.incident_id, i.location_id, date_trunc('hour', i.started_at) AS start_hour
        FROM traffic.fact_incident AS i
        CROSS JOIN bounds AS b
        WHERE i.location_id IS NOT NULL
          AND i.category IN ('accident', 'breakdown', 'vehicle_fire')
          AND i.started_at >= b.first_hour
          AND i.started_at < b.last_hour + INTERVAL '1 hour'
    ),
    observed AS (
        SELECT x.incident_id, k.offset_hours, f.location_id, f.observed_at, f.hour_of_day, f.is_weekend,
               f.avg_speed_kmh, f.vehicle_count
        FROM incidents AS x
        CROSS JOIN generate_series(-1, 3) AS k (offset_hours)
        JOIN traffic.fact_traffic_hourly AS f
            ON f.location_id = x.location_id
           AND f.observed_at = x.start_hour + k.offset_hours * INTERVAL '1 hour'
        WHERE f.is_analysis_eligible AND NOT f.is_low_sample
    ),
    baseline AS (
        -- One pass over the cells that had incidents: usual speed per month, hour and day type.
        SELECT f.location_id, date_trunc('month', f.observed_at) AS month, f.hour_of_day, f.is_weekend,
               AVG(f.avg_speed_kmh) AS speed, AVG(f.vehicle_count) AS vehicles, COUNT(*) AS hours
        FROM traffic.fact_traffic_hourly AS f
        WHERE f.location_id IN (SELECT DISTINCT location_id FROM incidents)
          AND f.is_analysis_eligible AND NOT f.is_low_sample
        GROUP BY 1, 2, 3, 4
    )
    SELECT o.incident_id, o.offset_hours, o.avg_speed_kmh, ROUND(b.speed, 2), o.vehicle_count, ROUND(b.vehicles, 1)
    FROM observed AS o
    JOIN baseline AS b
        ON b.location_id = o.location_id
       AND b.month = date_trunc('month', o.observed_at)
       AND b.hour_of_day = o.hour_of_day
       AND b.is_weekend = o.is_weekend
    WHERE b.hours >= 4;
END;
$$;
