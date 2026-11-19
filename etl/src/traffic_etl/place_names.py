"""Name every location cell after the neighbourhood and district it lies in.

The cells of the data set are geohashes, which mean nothing to a reader. This module
looks up the OpenStreetMap neighbourhood (mahalle, admin_level 8) and district
(ilçe, admin_level 6) of each cell centre through the Overpass API and writes them to
``database/reference/location_names.csv``. The file is committed, so a normal ETL run
never needs the network; ``apply`` copies it into ``traffic.dim_location``.

    python -m traffic_etl.place_names build   # query Overpass, rewrite the CSV
    python -m traffic_etl.place_names apply   # write the names into the database

Names are © OpenStreetMap contributors, available under the ODbL.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import psycopg

from traffic_etl.config import PROJECT_ROOT

logger = logging.getLogger("traffic_etl.place_names")

NAMES_PATH = PROJECT_ROOT / "database" / "reference" / "location_names.csv"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "istanbul-traffic-analytics/1.0 (open data portfolio project)"
BATCH_SIZE = 80
PAUSE_SECONDS = 2.0
RETRIES = 5
# Cells whose centre falls on water (bridges, coastal roads) are named after the
# closest land cell within this distance.
NEAREST_LIMIT_KM = 1.5

SUFFIXES = (" Mahallesi", " Mah.")


@dataclass(frozen=True)
class Location:
    geohash: str
    latitude: float
    longitude: float


@dataclass
class PlaceName:
    geohash: str
    neighborhood: str | None
    district: str | None
    source: str


def clean_neighborhood(name: str | None) -> str | None:
    """Drop the "Mahallesi" suffix, which every neighbourhood carries."""
    if not name:
        return None
    name = name.strip()
    for suffix in SUFFIXES:
        if name.endswith(suffix):
            return name[: -len(suffix)].strip()
    return name


def build_query(locations: list[Location]) -> str:
    """One Overpass query that returns a marker followed by the boundaries of each point."""
    parts = ["[out:json][timeout:600];"]
    for location in locations:
        parts.append(f'make p geohash="{location.geohash}";out;')
        parts.append(
            f"is_in({location.latitude:.6f},{location.longitude:.6f})->.a;"
            'rel(pivot.a)["boundary"="administrative"]["admin_level"~"^(6|8)$"];out tags;'
        )
    return "".join(parts)


def parse_response(elements: list[dict]) -> dict[str, PlaceName]:
    """Group the boundaries that follow each marker under the marker's geohash."""
    names: dict[str, PlaceName] = {}
    current: PlaceName | None = None
    for element in elements:
        tags = element.get("tags", {})
        if element.get("type") == "p":
            current = PlaceName(tags["geohash"], None, None, "osm")
            names[current.geohash] = current
            continue
        if current is None:
            continue
        name = tags.get("name:tr") or tags.get("name")
        if tags.get("admin_level") == "8" and current.neighborhood is None:
            current.neighborhood = clean_neighborhood(name)
        elif tags.get("admin_level") == "6" and current.district is None:
            current.district = name
    return names


def distance_km(a: Location, b: Location) -> float:
    """Equirectangular distance, accurate enough over a few kilometres."""
    x = math.radians(b.longitude - a.longitude) * math.cos(math.radians((a.latitude + b.latitude) / 2))
    y = math.radians(b.latitude - a.latitude)
    return 6371.0 * math.hypot(x, y)


def fill_from_nearest(
    locations: list[Location], names: dict[str, PlaceName], limit_km: float = NEAREST_LIMIT_KM
) -> int:
    """Give unnamed cells the names of the nearest named cell. Returns how many were filled."""
    by_hash = {location.geohash: location for location in locations}
    named = [by_hash[n.geohash] for n in names.values() if n.neighborhood and n.district]
    filled = 0
    for location in locations:
        current = names.get(location.geohash)
        if current is not None and current.neighborhood and current.district:
            continue
        nearest = min(named, key=lambda other: distance_km(location, other), default=None)
        if nearest is None or distance_km(location, nearest) > limit_km:
            continue
        source = names[nearest.geohash]
        names[location.geohash] = PlaceName(location.geohash, source.neighborhood, source.district, "nearest")
        filled += 1
    return filled


def _post(query: str) -> list[dict]:
    """POST a query, retrying with growing pauses when the public server is busy."""
    body = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(1, RETRIES + 1):
        request = urllib.request.Request(OVERPASS_URL, data=body, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                return json.load(response)["elements"]
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == RETRIES:
                raise
            wait = 15 * attempt
            logger.warning("Overpass failed (%s), retrying in %d s.", error, wait)
            time.sleep(wait)
    return []


def load_locations(database_url: str) -> list[Location]:
    with psycopg.connect(database_url) as connection:
        rows = connection.execute(
            "SELECT geohash, latitude, longitude FROM traffic.dim_location ORDER BY geohash"
        ).fetchall()
    return [Location(*row) for row in rows]


def build(database_url: str, path: Path = NAMES_PATH) -> dict[str, int]:
    locations = load_locations(database_url)
    names: dict[str, PlaceName] = {}
    for start in range(0, len(locations), BATCH_SIZE):
        batch = locations[start : start + BATCH_SIZE]
        names.update(parse_response(_post(build_query(batch))))
        logger.info("Looked up %d of %d cells.", min(start + BATCH_SIZE, len(locations)), len(locations))
        time.sleep(PAUSE_SECONDS)

    filled = fill_from_nearest(locations, names)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(["geohash", "neighborhood", "district", "source"])
        for location in locations:
            name = names.get(location.geohash) or PlaceName(location.geohash, None, None, "none")
            writer.writerow([name.geohash, name.neighborhood or "", name.district or "", name.source])

    counts = {
        "cells": len(locations),
        "named": sum(1 for n in names.values() if n.neighborhood and n.district),
        "from_nearest": filled,
    }
    logger.info("Wrote %s: %s", path, counts)
    return counts


def read_names(path: Path = NAMES_PATH) -> list[tuple[str, str | None, str | None]]:
    with path.open(encoding="utf-8", newline="") as file:
        return [(row["geohash"], row["neighborhood"] or None, row["district"] or None) for row in csv.DictReader(file)]


def apply(connection: psycopg.Connection, path: Path | None = None) -> int:
    """Write the names into dim_location. Cells missing from the file keep NULL names."""
    path = path or NAMES_PATH
    if not path.exists():
        logger.warning("%s not found, cells stay unnamed.", path)
        return 0
    rows = read_names(path)
    with connection.cursor() as cursor:
        cursor.execute(
            "CREATE TEMP TABLE location_names (geohash char(6), neighborhood text, district text) ON COMMIT DROP"
        )
        with cursor.copy("COPY location_names (geohash, neighborhood, district) FROM STDIN") as copy:
            for row in rows:
                copy.write_row(row)
        cursor.execute(
            """
            UPDATE traffic.dim_location AS l
            SET neighborhood = n.neighborhood, district = n.district
            FROM location_names AS n
            WHERE n.geohash = l.geohash
              AND (l.neighborhood IS DISTINCT FROM n.neighborhood OR l.district IS DISTINCT FROM n.district)
            """
        )
        return cursor.rowcount


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["build", "apply"])
    arguments = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    from traffic_etl.load import get_database_url

    if arguments.command == "build":
        build(get_database_url())
    else:
        with psycopg.connect(get_database_url()) as connection:
            updated = apply(connection)
        logger.info("Updated %d cells.", updated)


if __name__ == "__main__":
    main()
