"""Paths, data contract and quality thresholds of the ETL pipeline."""

from __future__ import annotations

from pathlib import Path

import pyarrow as pa

PROJECT_ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
REPORT_DIR = PROJECT_ROOT / "docs" / "etl-runs"
SCHEMA_DIR = PROJECT_ROOT / "database" / "schema"
ANALYSIS_SQL_DIR = PROJECT_ROOT / "database" / "analysis"
ANALYSIS_RESULTS_DIR = PROJECT_ROOT / "docs" / "analysis-results"

CHUNK_SIZE_ROWS = 250_000
TIMESTAMP_FORMAT = "%Y-%m-%d %H:%M:%S"

RAW_COLUMNS = [
    "DATE_TIME",
    "LATITUDE",
    "LONGITUDE",
    "GEOHASH",
    "MINIMUM_SPEED",
    "MAXIMUM_SPEED",
    "AVERAGE_SPEED",
    "NUMBER_OF_VEHICLES",
]
RAW_INTEGER_COLUMNS = [
    "MINIMUM_SPEED",
    "MAXIMUM_SPEED",
    "AVERAGE_SPEED",
    "NUMBER_OF_VEHICLES",
]

# Hard limits: a row outside these limits is moved to quarantine.
LAT_MIN, LAT_MAX = 40.70, 41.70
LON_MIN, LON_MAX = 27.90, 29.95
GEOHASH_LENGTH = 6
MAX_PLAUSIBLE_SPEED_KMH = 300
MAX_PLAUSIBLE_VEHICLES = 1_000_000
COORDINATE_TOLERANCE_DEGREES = 1e-6
MAX_REJECT_RATE = 0.01

# Soft limits: a row outside these limits is kept and flagged.
LOW_SAMPLE_VEHICLE_LIMIT = 5
SPEED_OUTLIER_AVG_KMH = 150
SUSPECT_MAX_SPEED_KMH = 200

# An hour is partial when it falls below this share of its normal level.
PARTIAL_HOUR_RATIO = 0.50
MIN_BASELINE_HOURS = 3

CLEAN_SCHEMA = pa.schema(
    [
        pa.field("observed_at", pa.timestamp("ms"), nullable=False),
        pa.field("geohash", pa.string(), nullable=False),
        pa.field("latitude", pa.float64(), nullable=False),
        pa.field("longitude", pa.float64(), nullable=False),
        pa.field("min_speed_kmh", pa.int16(), nullable=False),
        pa.field("max_speed_kmh", pa.int16(), nullable=False),
        pa.field("avg_speed_kmh", pa.int16(), nullable=False),
        pa.field("vehicle_count", pa.int32(), nullable=False),
        pa.field("is_weekend", pa.bool_(), nullable=False),
        pa.field("is_public_holiday", pa.bool_(), nullable=False),
        pa.field("is_low_sample", pa.bool_(), nullable=False),
        pa.field("is_speed_outlier", pa.bool_(), nullable=False),
        pa.field("is_max_speed_suspect", pa.bool_(), nullable=False),
        pa.field("is_partial_hour", pa.bool_(), nullable=False),
        pa.field("is_analysis_eligible", pa.bool_(), nullable=False),
    ]
)
