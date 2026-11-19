-- Hourly weather over Istanbul from the Open-Meteo historical archive (ERA5 based).
-- Values are the mean of three points across the city (west, centre, east) and are
-- stored on the hour they describe: observed_at 18:00 holds the rain of 18:00-18:59,
-- matching the hourly traffic rows. Filled by traffic_etl.weather.
CREATE TABLE IF NOT EXISTS traffic.weather_hourly (
    observed_at      timestamp(0) PRIMARY KEY,
    temperature_c    numeric(4, 1) NOT NULL,
    precipitation_mm numeric(5, 2) NOT NULL CHECK (precipitation_mm >= 0),
    snowfall_cm      numeric(5, 2) NOT NULL CHECK (snowfall_cm >= 0),
    weather_code     smallint      NOT NULL,
    loaded_at        timestamptz   NOT NULL DEFAULT now()
);
