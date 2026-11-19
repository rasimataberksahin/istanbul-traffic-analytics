-- Neighbourhood (mahalle) and district (ilçe) of each cell centre, from OpenStreetMap.
-- Filled by traffic_etl.place_names from database/reference/location_names.csv.
ALTER TABLE traffic.dim_location ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE traffic.dim_location ADD COLUMN IF NOT EXISTS district text;

CREATE INDEX IF NOT EXISTS ix_dim_location_district ON traffic.dim_location (district);
