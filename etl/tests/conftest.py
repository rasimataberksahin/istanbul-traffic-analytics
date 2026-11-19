from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from traffic_etl.config import RAW_COLUMNS
from traffic_etl.geo import decode_geohash

GEOHASHES = ["sxk96p", "sxk3z1", "sxk1v2"]


def raw_row(geohash: str = "sxk96p", **overrides: str) -> dict[str, str]:
    """Build one valid raw row whose values can be overridden per column."""
    cell = decode_geohash(geohash)
    row = {
        "DATE_TIME": "2024-10-01 08:00:00",
        "LATITUDE": str(cell.latitude),
        "LONGITUDE": str(cell.longitude),
        "GEOHASH": geohash,
        "MINIMUM_SPEED": "10",
        "MAXIMUM_SPEED": "90",
        "AVERAGE_SPEED": "50",
        "NUMBER_OF_VEHICLES": "20",
    }
    return row | overrides


def raw_frame(*rows: dict[str, str]) -> pd.DataFrame:
    return pd.DataFrame(list(rows), columns=RAW_COLUMNS, dtype=object)


def month_rows() -> list[dict[str, str]]:
    """Three cells for every hour of October 2024, with two simulated outages."""
    rows = []
    for hour in pd.date_range("2024-10-01 00:00", "2024-10-31 23:00", freq="h"):
        timestamp = str(hour)
        vehicles = "100"
        if timestamp == "2024-10-10 09:00:00":
            vehicles = "10"
        elif hour.date() == pd.Timestamp("2024-10-29").date():
            vehicles = "30"

        geohashes = GEOHASHES[:1] if timestamp == "2024-10-10 10:00:00" else GEOHASHES
        rows += [
            raw_row(geohash, DATE_TIME=timestamp, NUMBER_OF_VEHICLES=vehicles)
            for geohash in geohashes
        ]
    return rows


@pytest.fixture
def workspace(tmp_path: Path) -> dict[str, Path]:
    paths = {
        "raw": tmp_path / "raw",
        "processed": tmp_path / "processed",
        "reports": tmp_path / "reports",
    }
    paths["raw"].mkdir()
    return paths


def write_raw_csv(raw_dir: Path, rows: list[dict[str, str]]) -> Path:
    path = raw_dir / "traffic_density_202410.csv"
    raw_frame(*rows).to_csv(path, index=False)
    return path
