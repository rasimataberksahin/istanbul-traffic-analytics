"""Load hourly Istanbul weather from the Open-Meteo historical archive.

    python -m traffic_etl.weather                  # every loaded month
    python -m traffic_etl.weather --from 2024-01-01 --to 2024-12-31

Rain, snow and temperature are averaged over three points across the city so a shower
on one side does not stand for the whole of Istanbul. Open-Meteo reports precipitation
for the hour that *ends* at the timestamp; the loader moves it back one hour so that
``observed_at`` 18:00 holds the rain of 18:00-18:59, like the traffic rows.

Weather data by Open-Meteo.com, licensed CC BY 4.0.
"""

from __future__ import annotations

import argparse
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import psycopg

logger = logging.getLogger("traffic_etl.weather")

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
USER_AGENT = "istanbul-traffic-analytics/1.0 (open data portfolio project)"
VARIABLES = ("temperature_2m", "precipitation", "snowfall", "weather_code")
# West (Avcılar), centre (Fatih) and east (Kadıköy-Ataşehir).
POINTS = ((40.98, 28.72), (41.01, 28.97), (40.99, 29.12))
CHUNK_DAYS = 366
RETRIES = 4

UPSERT = """
INSERT INTO traffic.weather_hourly (observed_at, temperature_c, precipitation_mm, snowfall_cm, weather_code)
VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (observed_at) DO UPDATE SET
    temperature_c = EXCLUDED.temperature_c,
    precipitation_mm = EXCLUDED.precipitation_mm,
    snowfall_cm = EXCLUDED.snowfall_cm,
    weather_code = EXCLUDED.weather_code,
    loaded_at = now()
"""


@dataclass(frozen=True)
class WeatherHour:
    observed_at: datetime
    temperature_c: float
    precipitation_mm: float
    snowfall_cm: float
    weather_code: int


def build_url(start: date, end: date) -> str:
    query = {
        "latitude": ",".join(str(lat) for lat, _ in POINTS),
        "longitude": ",".join(str(lon) for _, lon in POINTS),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "hourly": ",".join(VARIABLES),
        "timezone": "Europe/Istanbul",
    }
    return f"{ARCHIVE_URL}?{urllib.parse.urlencode(query)}"


def combine(locations: list[dict]) -> list[WeatherHour]:
    """Average the points hour by hour and shift accumulated values to the hour they describe.

    Hours where any point has a missing value are skipped rather than guessed.
    """
    if not locations:
        return []
    times = locations[0]["hourly"]["time"]
    hours: list[WeatherHour] = []
    for index, stamp in enumerate(times):
        values = [location["hourly"] for location in locations]
        rows = [[series[name][index] for name in VARIABLES] for series in values]
        if any(value is None for row in rows for value in row):
            continue
        count = len(rows)
        hours.append(
            WeatherHour(
                # Precipitation at 19:00 fell between 18:00 and 19:00.
                observed_at=datetime.fromisoformat(stamp) - timedelta(hours=1),
                temperature_c=round(sum(row[0] for row in rows) / count, 1),
                precipitation_mm=round(sum(row[1] for row in rows) / count, 2),
                snowfall_cm=round(sum(row[2] for row in rows) / count, 2),
                # The most severe condition among the points describes the hour.
                weather_code=int(max(row[3] for row in rows)),
            )
        )
    return hours


def fetch(start: date, end: date) -> list[WeatherHour]:
    url = build_url(start, end)
    for attempt in range(1, RETRIES + 1):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = json.load(response)
            return combine(payload if isinstance(payload, list) else [payload])
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == RETRIES:
                raise
            logger.warning("Open-Meteo failed (%s), retrying.", error)
            time.sleep(10 * attempt)
    return []


def chunks(start: date, end: date, days: int = CHUNK_DAYS):
    cursor = start
    while cursor <= end:
        stop = min(end, cursor + timedelta(days=days - 1))
        yield cursor, stop
        cursor = stop + timedelta(days=1)


def loaded_range(connection: psycopg.Connection) -> tuple[date, date] | None:
    row = connection.execute(
        "SELECT MIN(month), (MAX(month) + INTERVAL '1 month - 1 day')::date FROM traffic.load_audit"
    ).fetchone()
    return (row[0], row[1]) if row and row[0] else None


def store(connection: psycopg.Connection, hours: list[WeatherHour]) -> int:
    with connection.cursor() as cursor:
        cursor.executemany(
            UPSERT,
            [(h.observed_at, h.temperature_c, h.precipitation_mm, h.snowfall_cm, h.weather_code) for h in hours],
        )
    return len(hours)


def load_weather(database_url: str, start: date | None = None, end: date | None = None) -> int:
    from traffic_etl.load import apply_schema

    with psycopg.connect(database_url) as connection:
        apply_schema(connection)
        if start is None or end is None:
            span = loaded_range(connection)
            if span is None:
                logger.warning("No months are loaded, nothing to do.")
                return 0
            start, end = start or span[0], end or span[1]
        total = 0
        for chunk_start, chunk_end in chunks(start, end):
            # One extra day: shifting the hours back needs the first hour of the next day.
            hours = [h for h in fetch(chunk_start, chunk_end + timedelta(days=1)) if start <= h.observed_at.date() <= end]
            total += store(connection, hours)
            logger.info("Weather %s - %s: %d hours.", chunk_start, chunk_end, len(hours))
        connection.execute("ANALYZE traffic.weather_hourly")
    return total


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--from", dest="start", type=date.fromisoformat)
    parser.add_argument("--to", dest="end", type=date.fromisoformat)
    arguments = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    from traffic_etl.load import get_database_url

    loaded = load_weather(get_database_url(), arguments.start, arguments.end)
    logger.info("Stored %d weather hours.", loaded)


if __name__ == "__main__":
    main()
