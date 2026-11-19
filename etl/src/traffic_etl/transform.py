"""Clean one raw monthly traffic file and publish it as Parquet.

    python -m traffic_etl.transform --month 2024-10

Rows that break a hard rule go to a quarantine CSV with the reason. Rows that are
valid but analytically risky are kept and flagged. Output files replace earlier
ones only after the written Parquet file passes the data contract.
"""

from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

from traffic_etl.config import (
    CHUNK_SIZE_ROWS,
    CLEAN_SCHEMA,
    COORDINATE_TOLERANCE_DEGREES,
    GEOHASH_LENGTH,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    LOW_SAMPLE_VEHICLE_LIMIT,
    MAX_PLAUSIBLE_SPEED_KMH,
    MAX_PLAUSIBLE_VEHICLES,
    MAX_REJECT_RATE,
    MIN_BASELINE_HOURS,
    PARTIAL_HOUR_RATIO,
    PROCESSED_DIR,
    RAW_COLUMNS,
    RAW_DIR,
    RAW_INTEGER_COLUMNS,
    REPORT_DIR,
    SPEED_OUTLIER_AVG_KMH,
    SUSPECT_MAX_SPEED_KMH,
    TIMESTAMP_FORMAT,
)
from traffic_etl.duplicates import DuplicateTracker
from traffic_etl.geo import decode_geohash
from traffic_etl.holidays import public_holiday_mask
from traffic_etl.validate import DataValidationError, validate_clean_file

logger = logging.getLogger("traffic_etl.transform")


@dataclass(frozen=True)
class CleanedChunk:
    clean: pd.DataFrame
    rejected: pd.DataFrame


def _reject_reasons(
    text: pd.DataFrame,
    observed_at: pd.Series,
    geohash: pd.Series,
    numbers: dict[str, pd.Series],
    month: str,
) -> pd.Series:
    """Return the first broken hard rule of every row, or ``None``."""
    year, month_number = int(month[:4]), int(month[5:])
    minimum = numbers["MINIMUM_SPEED"]
    maximum = numbers["MAXIMUM_SPEED"]
    average = numbers["AVERAGE_SPEED"]
    vehicles = numbers["NUMBER_OF_VEHICLES"]
    latitude = numbers["LATITUDE"]
    longitude = numbers["LONGITUDE"]

    invalid_number = pd.Series(False, index=text.index)
    for column, values in numbers.items():
        invalid_number |= ~np.isfinite(values)
        if column in RAW_INTEGER_COLUMNS:
            invalid_number |= values != np.floor(values)

    cells = {
        value: decode_geohash(value) if len(value) == GEOHASH_LENGTH else None
        for value in geohash.dropna().unique()
    }
    valid_cells = {value: cell for value, cell in cells.items() if cell is not None}
    lat_delta = (latitude - geohash.map({k: c.latitude for k, c in valid_cells.items()})).abs()
    lon_delta = (longitude - geohash.map({k: c.longitude for k, c in valid_cells.items()})).abs()
    lat_limit = geohash.map({k: c.latitude_half for k, c in valid_cells.items()})
    lon_limit = geohash.map({k: c.longitude_half for k, c in valid_cells.items()})

    rules: list[tuple[str, pd.Series]] = [
        ("missing_value", (text.isna() | (text == "")).any(axis=1)),
        ("invalid_timestamp", observed_at.isna()),
        (
            "timestamp_outside_month",
            (observed_at.dt.year != year) | (observed_at.dt.month != month_number),
        ),
        (
            "timestamp_not_on_hour",
            (observed_at.dt.minute != 0) | (observed_at.dt.second != 0),
        ),
        ("invalid_number", invalid_number),
        ("invalid_speed_order", (minimum > average) | (average > maximum)),
        ("speed_out_of_range", (minimum < 0) | (maximum > MAX_PLAUSIBLE_SPEED_KMH)),
        (
            "vehicle_count_out_of_range",
            (vehicles <= 0) | (vehicles > MAX_PLAUSIBLE_VEHICLES),
        ),
        (
            "outside_istanbul_bounds",
            ~(latitude.between(LAT_MIN, LAT_MAX) & longitude.between(LON_MIN, LON_MAX)),
        ),
        ("invalid_geohash", ~geohash.isin(list(valid_cells))),
        (
            "coordinate_geohash_mismatch",
            (lat_delta > lat_limit + COORDINATE_TOLERANCE_DEGREES)
            | (lon_delta > lon_limit + COORDINATE_TOLERANCE_DEGREES),
        ),
    ]

    reasons = pd.Series(None, index=text.index, dtype=object)
    for name, mask in rules:
        reasons = reasons.mask(reasons.isna() & mask, name)
    return reasons


def clean_chunk(raw: pd.DataFrame, month: str, tracker: DuplicateTracker) -> CleanedChunk:
    """Split a raw chunk into typed clean rows and quarantined rows."""
    text = raw[RAW_COLUMNS].apply(lambda column: column.str.strip())
    observed_at = pd.to_datetime(text["DATE_TIME"], format=TIMESTAMP_FORMAT, errors="coerce")
    geohash = text["GEOHASH"].str.lower()
    numbers = {
        column: pd.to_numeric(text[column], errors="coerce")
        for column in ["LATITUDE", "LONGITUDE", *RAW_INTEGER_COLUMNS]
    }

    reasons = _reject_reasons(text, observed_at, geohash, numbers, month)
    candidates = reasons.isna()
    duplicates = tracker.find_duplicates(observed_at[candidates], geohash[candidates])
    reasons.loc[reasons.index[candidates.to_numpy()][duplicates]] = "duplicate_key"

    keep = reasons.isna()
    timestamps = observed_at[keep]
    minimum = numbers["MINIMUM_SPEED"][keep].astype("int16")
    maximum = numbers["MAXIMUM_SPEED"][keep].astype("int16")
    average = numbers["AVERAGE_SPEED"][keep].astype("int16")
    vehicles = numbers["NUMBER_OF_VEHICLES"][keep].astype("int32")
    outlier = average > SPEED_OUTLIER_AVG_KMH

    clean = pd.DataFrame(
        {
            "observed_at": timestamps,
            "geohash": geohash[keep],
            "latitude": numbers["LATITUDE"][keep],
            "longitude": numbers["LONGITUDE"][keep],
            "min_speed_kmh": minimum,
            "max_speed_kmh": maximum,
            "avg_speed_kmh": average,
            "vehicle_count": vehicles,
            "is_weekend": timestamps.dt.dayofweek >= 5,
            "is_public_holiday": public_holiday_mask(timestamps),
            "is_low_sample": vehicles < LOW_SAMPLE_VEHICLE_LIMIT,
            "is_speed_outlier": outlier,
            "is_max_speed_suspect": maximum > SUSPECT_MAX_SPEED_KMH,
            "is_partial_hour": False,
            "is_analysis_eligible": ~outlier,
        }
    )
    rejected = raw.loc[~keep, RAW_COLUMNS].assign(reject_reason=reasons[~keep])
    return CleanedChunk(clean=clean, rejected=rejected)


def detect_partial_hours(hourly: pd.DataFrame) -> pd.DataFrame:
    """Find hours far below the normal level of the same day type and hour.

    ``hourly`` is indexed by hour and has ``rows`` and ``vehicles`` columns. Holidays
    are left out of the baseline, and low traffic alone cannot flag a holiday hour.
    """
    frame = hourly.sort_index().copy()
    frame.index.name = "observed_at"
    frame["is_weekend"] = frame.index.dayofweek >= 5
    frame["hour"] = frame.index.hour
    frame["is_holiday"] = public_holiday_mask(frame.index)

    baseline = (
        frame.loc[~frame["is_holiday"]]
        .groupby(["is_weekend", "hour"])
        .agg(
            rows_median=("rows", "median"),
            vehicles_median=("vehicles", "median"),
            samples=("rows", "size"),
        )
        .reset_index()
    )
    merged = (
        frame.reset_index()
        .merge(baseline, on=["is_weekend", "hour"], how="left")
        .set_index("observed_at")
    )
    merged["rows_ratio"] = merged["rows"] / merged["rows_median"]
    merged["vehicles_ratio"] = merged["vehicles"] / merged["vehicles_median"]

    has_baseline = merged["samples"] >= MIN_BASELINE_HOURS
    few_rows = merged["rows_ratio"] < PARTIAL_HOUR_RATIO
    few_vehicles = (merged["vehicles_ratio"] < PARTIAL_HOUR_RATIO) & ~merged["is_holiday"]
    columns = ["rows", "vehicles", "rows_ratio", "vehicles_ratio"]
    return merged.loc[has_baseline & (few_rows | few_vehicles), columns]


def _to_table(frame: pd.DataFrame) -> pa.Table:
    table = pa.Table.from_pandas(frame, schema=CLEAN_SCHEMA, preserve_index=False)
    return table.replace_schema_metadata(None)


def _apply_partial_hours(stage_path: Path, output_path: Path, partial_hours: pd.Index) -> None:
    """Rewrite the staged file with flags that need the whole month to be known."""
    value_set = pa.array(
        [hour.to_pydatetime() for hour in partial_hours],
        type=CLEAN_SCHEMA.field("observed_at").type,
    )
    with (
        pq.ParquetFile(stage_path) as stage,
        pq.ParquetWriter(output_path, CLEAN_SCHEMA, compression="zstd") as writer,
    ):
        for group in range(stage.num_row_groups):
            table = stage.read_row_group(group)
            partial = pc.is_in(table["observed_at"], value_set=value_set)
            eligible = pc.and_not(pc.invert(table["is_speed_outlier"]), partial)
            for name, values in [("is_partial_hour", partial), ("is_analysis_eligible", eligible)]:
                index = table.schema.get_field_index(name)
                table = table.set_column(index, CLEAN_SCHEMA.field(name), values)
            writer.write_table(table.cast(CLEAN_SCHEMA))


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_raw_file(csv_path: Path) -> str:
    """Stop when the raw file differs from its download manifest."""
    checksum = _sha256(csv_path)
    manifest_path = csv_path.with_suffix(".manifest.json")
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest["sha256"] != checksum:
            raise DataValidationError(f"{csv_path.name} does not match its manifest.")
    return checksum


def run_transform(
    month: str,
    raw_dir: Path = RAW_DIR,
    processed_dir: Path = PROCESSED_DIR,
    report_dir: Path = REPORT_DIR,
    chunk_size: int = CHUNK_SIZE_ROWS,
) -> dict[str, Any]:
    """Run the full transform for one ``YYYY-MM`` month and return its report."""
    compact_month = month.replace("-", "")
    csv_path = raw_dir / f"traffic_density_{compact_month}.csv"
    clean_path = processed_dir / f"traffic_clean_{compact_month}.parquet"
    rejected_path = processed_dir / f"traffic_rejected_{compact_month}.csv"
    report_path = report_dir / f"traffic_clean_{compact_month}.report.json"
    stage_path = processed_dir / f".{clean_path.stem}.stage.parquet"
    temp_clean_path = processed_dir / f".{clean_path.stem}.tmp.parquet"
    temp_rejected_path = processed_dir / f".{rejected_path.stem}.tmp.csv"

    processed_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)
    raw_checksum = _verify_raw_file(csv_path)

    header = pd.read_csv(csv_path, nrows=0, encoding="utf-8").columns.tolist()
    if header != RAW_COLUMNS:
        raise DataValidationError(f"Unexpected raw columns: {header}")

    tracker = DuplicateTracker()
    reject_counts: pd.Series = pd.Series(dtype="int64")
    hourly_parts: list[pd.DataFrame] = []
    raw_rows = clean_rows = clean_vehicles = 0

    try:
        pd.DataFrame(columns=[*RAW_COLUMNS, "reject_reason"]).to_csv(
            temp_rejected_path, index=False, lineterminator="\n"
        )
        reader = pd.read_csv(
            csv_path,
            dtype=str,
            keep_default_na=False,
            chunksize=chunk_size,
            encoding="utf-8",
        )
        with pq.ParquetWriter(stage_path, CLEAN_SCHEMA, compression="zstd") as stage_writer:
            for raw in reader:
                result = clean_chunk(raw, month, tracker)
                raw_rows += len(raw)
                clean_rows += len(result.clean)
                clean_vehicles += int(result.clean["vehicle_count"].astype("int64").sum())

                if not result.clean.empty:
                    stage_writer.write_table(_to_table(result.clean))
                    hourly_parts.append(
                        result.clean.groupby("observed_at").agg(
                            rows=("geohash", "size"),
                            vehicles=("vehicle_count", lambda s: int(s.astype("int64").sum())),
                        )
                    )
                if not result.rejected.empty:
                    result.rejected.to_csv(
                        temp_rejected_path,
                        mode="a",
                        header=False,
                        index=False,
                        lineterminator="\n",
                    )
                    reject_counts = reject_counts.add(
                        result.rejected["reject_reason"].value_counts(), fill_value=0
                    )
                logger.info("Cleaned %s rows.", f"{raw_rows:,}")

        rejected_rows = raw_rows - clean_rows
        if raw_rows == 0 or rejected_rows / raw_rows > MAX_REJECT_RATE:
            raise DataValidationError(
                f"{rejected_rows:,} of {raw_rows:,} rows were rejected. "
                f"The limit is {MAX_REJECT_RATE:.0%}."
            )

        hourly = pd.concat(hourly_parts).groupby(level=0).sum()
        partial = detect_partial_hours(hourly)
        _apply_partial_hours(stage_path, temp_clean_path, partial.index)

        summary = validate_clean_file(
            temp_clean_path,
            month,
            expected_rows=clean_rows,
            expected_vehicles=clean_vehicles,
            partial_hours=partial.index,
        )

        os.replace(temp_clean_path, clean_path)
        os.replace(temp_rejected_path, rejected_path)
    finally:
        for path in (stage_path, temp_clean_path, temp_rejected_path):
            path.unlink(missing_ok=True)

    year, month_number = int(month[:4]), int(month[5:])
    expected_hours = calendar.monthrange(year, month_number)[1] * 24
    report = {
        "month": month,
        "input": {
            "file": csv_path.name,
            "sha256": raw_checksum,
            "size_bytes": csv_path.stat().st_size,
            "rows": raw_rows,
        },
        "output": {
            "file": clean_path.name,
            "sha256": _sha256(clean_path),
            "size_bytes": clean_path.stat().st_size,
            "rows": clean_rows,
            "columns": len(CLEAN_SCHEMA),
            "quarantine_file": rejected_path.name,
            "quarantined_rows": rejected_rows,
        },
        "reconciliation": {
            "raw_rows_equal_clean_plus_quarantined": raw_rows == clean_rows + rejected_rows,
        },
        "reject_reasons": {
            str(reason): int(count) for reason, count in reject_counts.sort_index().items()
        },
        "time_coverage": {
            "expected_hours": expected_hours,
            "observed_hours": int(len(hourly)),
        },
        "partial_hours": [
            {
                "observed_at": str(hour),
                "rows": int(row["rows"]),
                "vehicles": int(row["vehicles"]),
                "rows_ratio": round(float(row["rows_ratio"]), 3),
                "vehicles_ratio": round(float(row["vehicles_ratio"]), 3),
            }
            for hour, row in partial.iterrows()
        ],
        "thresholds": {
            "low_sample_vehicle_limit": LOW_SAMPLE_VEHICLE_LIMIT,
            "speed_outlier_avg_kmh": SPEED_OUTLIER_AVG_KMH,
            "suspect_max_speed_kmh": SUSPECT_MAX_SPEED_KMH,
            "partial_hour_ratio": PARTIAL_HOUR_RATIO,
            "max_reject_rate": MAX_REJECT_RATE,
        },
        "validation": summary,
    }
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--month", required=True, help="YYYY-MM")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", args.month):
        parser.error("Month must use the YYYY-MM format.")

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    started = time.perf_counter()
    report = run_transform(args.month)
    logger.info(
        "Finished in %.0f s: %s clean rows, %s quarantined rows, %d partial hours.",
        time.perf_counter() - started,
        f"{report['output']['rows']:,}",
        f"{report['output']['quarantined_rows']:,}",
        len(report["partial_hours"]),
    )


if __name__ == "__main__":
    main()
