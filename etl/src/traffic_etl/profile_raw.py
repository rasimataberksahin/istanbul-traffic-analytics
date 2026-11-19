"""Profile a raw monthly traffic CSV without loading it into memory at once.

Every row is scanned. Values are read as text first, so malformed values are
counted instead of being silently converted by pandas:

    python -m traffic_etl.profile_raw --month 2024-10
"""

from __future__ import annotations

import argparse
import calendar
import json
import logging
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from traffic_etl.geo import decode_geohash

PROJECT_ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROFILE_DIR = PROJECT_ROOT / "docs" / "profiles"

CHUNK_SIZE_ROWS = 250_000
EXPECTED_COLUMNS = [
    "DATE_TIME",
    "LATITUDE",
    "LONGITUDE",
    "GEOHASH",
    "MINIMUM_SPEED",
    "MAXIMUM_SPEED",
    "AVERAGE_SPEED",
    "NUMBER_OF_VEHICLES",
]
INTEGER_COLUMNS = [
    "MINIMUM_SPEED",
    "MAXIMUM_SPEED",
    "AVERAGE_SPEED",
    "NUMBER_OF_VEHICLES",
]
SPEED_THRESHOLDS_KMH = [120, 150, 200, 250]

# Generous bounding box around the Istanbul province.
ISTANBUL_BOUNDS = {
    "lat_min": 40.70,
    "lat_max": 41.70,
    "lon_min": 27.90,
    "lon_max": 29.95,
}
COORDINATE_TOLERANCE_DEGREES = 1e-6

logger = logging.getLogger("traffic_etl.profile_raw")


def weighted_quantile(counts: Counter, quantile: float) -> float | None:
    """Exact quantile computed from a value-frequency table."""
    if not counts:
        return None
    values = np.array(sorted(counts))
    frequencies = np.array([counts[value] for value in values])
    position = quantile * frequencies.sum()
    index = int(np.searchsorted(np.cumsum(frequencies), position, side="left"))
    return float(values[min(index, len(values) - 1)])


def describe_counts(counts: Counter) -> dict[str, float | int | None]:
    total = sum(counts.values())
    if total == 0:
        return {"count": 0}
    return {
        "count": total,
        "min": min(counts),
        "p01": weighted_quantile(counts, 0.01),
        "p25": weighted_quantile(counts, 0.25),
        "median": weighted_quantile(counts, 0.50),
        "mean": round(sum(value * n for value, n in counts.items()) / total, 3),
        "p75": weighted_quantile(counts, 0.75),
        "p99": weighted_quantile(counts, 0.99),
        "max": max(counts),
        "distinct": len(counts),
    }


def profile_file(csv_path: Path, month: str) -> dict[str, Any]:
    year, month_number = int(month[:4]), int(month[5:])
    days_in_month = calendar.monthrange(year, month_number)[1]
    expected_hours = pd.date_range(
        f"{month}-01 00:00:00", periods=days_in_month * 24, freq="h"
    )

    total_rows = 0
    missing = Counter()
    whitespace = Counter()
    unparsable = Counter()
    non_integer = Counter()
    numeric_counts = {column: Counter() for column in INTEGER_COLUMNS}
    timestamp_counts: Counter = Counter()
    location_counts: Counter = Counter()
    rule_violations = Counter()
    full_row_hashes: list[np.ndarray] = []
    key_hashes: list[np.ndarray] = []
    columns: list[str] = []

    reader = pd.read_csv(
        csv_path,
        dtype=str,
        keep_default_na=False,
        chunksize=CHUNK_SIZE_ROWS,
        encoding="utf-8",
    )

    for chunk_number, chunk in enumerate(reader, start=1):
        columns = list(chunk.columns)
        total_rows += len(chunk)

        for column in columns:
            text = chunk[column]
            missing[column] += int((text.str.strip() == "").sum())
            whitespace[column] += int((text != text.str.strip()).sum())

        parsed_time = pd.to_datetime(
            chunk["DATE_TIME"], format="%Y-%m-%d %H:%M:%S", errors="coerce"
        )
        unparsable["DATE_TIME"] += int(parsed_time.isna().sum())
        timestamp_counts.update(chunk["DATE_TIME"].value_counts().to_dict())
        rule_violations["timestamp_outside_month"] += int(
            (
                parsed_time.notna()
                & ((parsed_time.dt.year != year) | (parsed_time.dt.month != month_number))
            ).sum()
        )
        rule_violations["timestamp_not_on_the_hour"] += int(
            (
                parsed_time.notna()
                & ((parsed_time.dt.minute != 0) | (parsed_time.dt.second != 0))
            ).sum()
        )

        numbers = {
            column: pd.to_numeric(chunk[column], errors="coerce")
            for column in ["LATITUDE", "LONGITUDE", *INTEGER_COLUMNS]
        }
        for column, values in numbers.items():
            unparsable[column] += int(values.isna().sum())
        for column in INTEGER_COLUMNS:
            values = numbers[column].dropna()
            non_integer[column] += int((values != np.floor(values)).sum())
            numeric_counts[column].update(values.value_counts().to_dict())

        minimum = numbers["MINIMUM_SPEED"]
        maximum = numbers["MAXIMUM_SPEED"]
        average = numbers["AVERAGE_SPEED"]
        vehicles = numbers["NUMBER_OF_VEHICLES"]
        latitude = numbers["LATITUDE"]
        longitude = numbers["LONGITUDE"]

        checks = {
            "min_speed_greater_than_max_speed": minimum > maximum,
            "avg_speed_below_min_speed": average < minimum,
            "avg_speed_above_max_speed": average > maximum,
            "negative_speed": (minimum < 0) | (maximum < 0) | (average < 0),
            "zero_min_speed": minimum == 0,
            "zero_max_speed": maximum == 0,
            "zero_avg_speed": average == 0,
            "zero_or_negative_vehicles": vehicles <= 0,
            "single_vehicle": vehicles == 1,
            "single_vehicle_with_speed_range": (vehicles == 1) & (minimum != maximum),
            "outside_istanbul_bounds": ~(
                latitude.between(ISTANBUL_BOUNDS["lat_min"], ISTANBUL_BOUNDS["lat_max"])
                & longitude.between(ISTANBUL_BOUNDS["lon_min"], ISTANBUL_BOUNDS["lon_max"])
            ),
            "geohash_length_not_6": chunk["GEOHASH"].str.len() != 6,
        }
        for threshold in SPEED_THRESHOLDS_KMH:
            checks[f"max_speed_above_{threshold}"] = maximum > threshold
            checks[f"avg_speed_above_{threshold}"] = average > threshold
        for name, mask in checks.items():
            rule_violations[name] += int(mask.sum())

        location_counts.update(
            chunk.groupby(["GEOHASH", "LATITUDE", "LONGITUDE"]).size().to_dict()
        )
        full_row_hashes.append(
            pd.util.hash_pandas_object(chunk[columns], index=False).to_numpy()
        )
        key_hashes.append(
            pd.util.hash_pandas_object(chunk[["DATE_TIME", "GEOHASH"]], index=False).to_numpy()
        )
        logger.info("Chunk %d scanned, %s rows so far.", chunk_number, f"{total_rows:,}")

    unique_full_rows = int(np.unique(np.concatenate(full_row_hashes)).size)
    unique_keys = int(np.unique(np.concatenate(key_hashes)).size)

    # Geospatial consistency is checked once per distinct location.
    rows_per_geohash: Counter = Counter()
    coordinates_per_geohash: Counter = Counter()
    invalid_geohashes = 0
    outside_cell_rows = 0
    not_center_rows = 0
    for (geohash, latitude, longitude), rows in location_counts.items():
        rows_per_geohash[geohash] += rows
        coordinates_per_geohash[geohash] += 1
        decoded = decode_geohash(geohash)
        if decoded is None:
            invalid_geohashes += 1
            continue
        lat_center, lon_center, lat_half, lon_half = decoded
        lat_delta = abs(float(latitude) - lat_center)
        lon_delta = abs(float(longitude) - lon_center)
        tolerance = COORDINATE_TOLERANCE_DEGREES
        if lat_delta > lat_half + tolerance or lon_delta > lon_half + tolerance:
            outside_cell_rows += rows
        if lat_delta > tolerance or lon_delta > tolerance:
            not_center_rows += rows

    observed_hours = pd.to_datetime(pd.Index(timestamp_counts), errors="coerce").dropna()
    missing_hours = expected_hours.difference(observed_hours)
    rows_by_hour = pd.Series(timestamp_counts, dtype="int64")
    rows_by_hour.index = pd.to_datetime(rows_by_hour.index, errors="coerce")
    rows_by_hour = rows_by_hour[rows_by_hour.index.notna()].sort_index()
    rows_by_day = rows_by_hour.groupby(rows_by_hour.index.date).sum()
    rows_by_hour_of_day = rows_by_hour.groupby(rows_by_hour.index.hour).sum()
    geohash_rows = pd.Series(rows_per_geohash, dtype="int64")
    total_hours = len(expected_hours)

    return {
        "file": {
            "name": csv_path.name,
            "size_bytes": csv_path.stat().st_size,
            "size_mb": round(csv_path.stat().st_size / 1_000_000, 1),
            "rows": total_rows,
            "columns": len(columns),
            "header_matches_expected": columns == EXPECTED_COLUMNS,
            "column_names": columns,
            "average_bytes_per_row": round(csv_path.stat().st_size / total_rows, 1),
        },
        "completeness": {
            "missing_values": {column: missing[column] for column in columns},
            "values_with_surrounding_whitespace": {
                column: whitespace[column] for column in columns
            },
            "unparsable_values": dict(unparsable),
            "non_integer_values": dict(non_integer),
        },
        "numeric_summary": {
            column: describe_counts(numeric_counts[column]) for column in INTEGER_COLUMNS
        },
        "duplicates": {
            "exact_duplicate_rows": total_rows - unique_full_rows,
            "duplicate_datetime_geohash_rows": total_rows - unique_keys,
            "conflicting_key_rows": unique_full_rows - unique_keys,
        },
        "time_coverage": {
            "first_timestamp": str(rows_by_hour.index.min()),
            "last_timestamp": str(rows_by_hour.index.max()),
            "expected_hours": total_hours,
            "observed_hours": int(len(observed_hours)),
            "missing_hours": [str(hour) for hour in missing_hours],
            "rows_per_hour": {
                "min": int(rows_by_hour.min()),
                "median": float(rows_by_hour.median()),
                "mean": round(float(rows_by_hour.mean()), 1),
                "max": int(rows_by_hour.max()),
            },
            "lowest_coverage_hours": {
                str(hour): int(rows)
                for hour, rows in rows_by_hour.nsmallest(10).items()
            },
            "rows_by_day": {str(day): int(rows) for day, rows in rows_by_day.items()},
            "rows_by_hour_of_day": {
                int(hour): int(rows) for hour, rows in rows_by_hour_of_day.items()
            },
        },
        "geography": {
            "distinct_geohashes": len(rows_per_geohash),
            "distinct_locations": len(location_counts),
            "geohashes_with_multiple_coordinates": sum(
                1 for count in coordinates_per_geohash.values() if count > 1
            ),
            "invalid_geohashes": invalid_geohashes,
            "rows_with_coordinates_outside_geohash_cell": outside_cell_rows,
            "rows_with_coordinates_not_at_cell_center": not_center_rows,
            "rows_per_geohash": {
                "min": int(geohash_rows.min()),
                "median": float(geohash_rows.median()),
                "mean": round(float(geohash_rows.mean()), 1),
                "max": int(geohash_rows.max()),
            },
            "geohashes_seen_in_every_hour": int((geohash_rows == total_hours).sum()),
            "geohashes_below_10_percent_of_hours": int(
                (geohash_rows < total_hours * 0.10).sum()
            ),
            "latitude_range": [
                min(float(key[1]) for key in location_counts),
                max(float(key[1]) for key in location_counts),
            ],
            "longitude_range": [
                min(float(key[2]) for key in location_counts),
                max(float(key[2]) for key in location_counts),
            ],
        },
        "rule_violations": dict(sorted(rule_violations.items())),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--month", required=True, help="YYYY-MM")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    file_stem = f"traffic_density_{args.month.replace('-', '')}"
    profile = profile_file(RAW_DIR / f"{file_stem}.csv", args.month)

    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    output_path = PROFILE_DIR / f"{file_stem}.profile.json"
    output_path.write_text(
        json.dumps(profile, ensure_ascii=False, indent=2, default=float) + "\n",
        encoding="utf-8",
    )
    logger.info("Profile written to %s", output_path)


if __name__ == "__main__":
    main()
