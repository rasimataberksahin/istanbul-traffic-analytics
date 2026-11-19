"""Post-transform data contract checks.

The checks read the written Parquet file back, so they test what consumers will
actually receive rather than the in-memory data that produced it.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow.parquet as pq

from traffic_etl.config import (
    CLEAN_SCHEMA,
    GEOHASH_LENGTH,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    LOW_SAMPLE_VEHICLE_LIMIT,
    MAX_PLAUSIBLE_SPEED_KMH,
    SPEED_OUTLIER_AVG_KMH,
    SUSPECT_MAX_SPEED_KMH,
)
from traffic_etl.duplicates import DuplicateTracker
from traffic_etl.holidays import public_holiday_mask

FLAG_COLUMNS = [
    "is_weekend",
    "is_public_holiday",
    "is_low_sample",
    "is_speed_outlier",
    "is_max_speed_suspect",
    "is_partial_hour",
    "is_analysis_eligible",
]


class DataValidationError(RuntimeError):
    """Raised when data breaks the contract and must not be published."""


def _row_violations(
    frame: pd.DataFrame, month: str, partial_hours: pd.DatetimeIndex
) -> dict[str, pd.Series]:
    year, month_number = int(month[:4]), int(month[5:])
    observed_at = frame["observed_at"]
    low_sample = frame["vehicle_count"] < LOW_SAMPLE_VEHICLE_LIMIT
    outlier = frame["avg_speed_kmh"] > SPEED_OUTLIER_AVG_KMH
    suspect = frame["max_speed_kmh"] > SUSPECT_MAX_SPEED_KMH
    partial = observed_at.isin(partial_hours)

    return {
        "no_null_values": frame.isna().any(axis=1),
        "timestamp_inside_month": (observed_at.dt.year != year)
        | (observed_at.dt.month != month_number),
        "timestamp_on_the_hour": (observed_at.dt.minute != 0) | (observed_at.dt.second != 0),
        "speed_order": (frame["min_speed_kmh"] > frame["avg_speed_kmh"])
        | (frame["avg_speed_kmh"] > frame["max_speed_kmh"]),
        "speed_range": (frame["min_speed_kmh"] < 0)
        | (frame["max_speed_kmh"] > MAX_PLAUSIBLE_SPEED_KMH),
        "vehicle_count_positive": frame["vehicle_count"] <= 0,
        "coordinates_inside_istanbul": ~(
            frame["latitude"].between(LAT_MIN, LAT_MAX)
            & frame["longitude"].between(LON_MIN, LON_MAX)
        ),
        "geohash_length": frame["geohash"].str.len() != GEOHASH_LENGTH,
        "flag_is_weekend": frame["is_weekend"] != (observed_at.dt.dayofweek >= 5),
        "flag_is_public_holiday": frame["is_public_holiday"] != public_holiday_mask(observed_at),
        "flag_is_low_sample": frame["is_low_sample"] != low_sample,
        "flag_is_speed_outlier": frame["is_speed_outlier"] != outlier,
        "flag_is_max_speed_suspect": frame["is_max_speed_suspect"] != suspect,
        "flag_is_partial_hour": frame["is_partial_hour"] != partial,
        "flag_is_analysis_eligible": frame["is_analysis_eligible"] != (~partial & ~outlier),
    }


def validate_clean_file(
    path: Path,
    month: str,
    expected_rows: int,
    expected_vehicles: int,
    partial_hours: Iterable[pd.Timestamp] = (),
) -> dict[str, Any]:
    """Check a clean Parquet file and return its summary, or raise on any breach."""
    with pq.ParquetFile(path) as parquet_file:
        return _validate_parquet(
            parquet_file, month, expected_rows, expected_vehicles, partial_hours
        )


def _validate_parquet(
    parquet_file: pq.ParquetFile,
    month: str,
    expected_rows: int,
    expected_vehicles: int,
    partial_hours: Iterable[pd.Timestamp],
) -> dict[str, Any]:
    actual_schema = parquet_file.schema_arrow.remove_metadata()
    if not actual_schema.equals(CLEAN_SCHEMA):
        raise DataValidationError(f"Schema mismatch:\n{actual_schema}")

    partial_index = pd.DatetimeIndex(list(partial_hours))
    tracker = DuplicateTracker()
    violations: Counter = Counter()
    flag_counts: Counter = Counter()
    rows = vehicles = weighted_speed = 0
    eligible_vehicles = eligible_weighted_speed = 0

    for group in range(parquet_file.num_row_groups):
        frame = parquet_file.read_row_group(group).to_pandas()
        frame["observed_at"] = frame["observed_at"].astype("datetime64[ns]")

        for name, mask in _row_violations(frame, month, partial_index).items():
            violations[name] += int(mask.sum())
        violations["unique_key"] += int(
            tracker.find_duplicates(frame["observed_at"], frame["geohash"]).sum()
        )
        for flag in FLAG_COLUMNS:
            flag_counts[flag] += int(frame[flag].sum())

        counts = frame["vehicle_count"].astype("int64")
        speed_volume = frame["avg_speed_kmh"].astype("int64") * counts
        eligible = frame["is_analysis_eligible"]
        rows += len(frame)
        vehicles += int(counts.sum())
        weighted_speed += int(speed_volume.sum())
        eligible_vehicles += int(counts[eligible].sum())
        eligible_weighted_speed += int(speed_volume[eligible].sum())

    violations["row_count_reconciled"] = abs(rows - expected_rows)
    violations["vehicle_total_reconciled"] = abs(vehicles - expected_vehicles)
    violations["file_not_empty"] = int(rows == 0)

    failed = {name: count for name, count in violations.items() if count}
    if failed:
        raise DataValidationError(f"Data contract violations: {failed}")

    return {
        "checks_passed": sorted(violations),
        "rows": rows,
        "vehicle_total": vehicles,
        "flag_counts": {flag: flag_counts[flag] for flag in FLAG_COLUMNS},
        "vehicle_weighted_avg_speed_kmh": round(weighted_speed / vehicles, 2),
        "eligible_vehicle_weighted_avg_speed_kmh": round(
            eligible_weighted_speed / eligible_vehicles, 2
        )
        if eligible_vehicles
        else None,
    }
