from __future__ import annotations

import pandas as pd
import pytest

from conftest import raw_frame, raw_row
from traffic_etl.duplicates import DuplicateTracker
from traffic_etl.transform import clean_chunk

MONTH = "2024-10"


def clean(*rows: dict[str, str], tracker: DuplicateTracker | None = None):
    return clean_chunk(raw_frame(*rows), MONTH, tracker or DuplicateTracker())


def test_valid_row_is_typed_and_renamed():
    row = clean(raw_row()).clean.iloc[0]

    assert row["observed_at"] == pd.Timestamp("2024-10-01 08:00:00")
    assert row["geohash"] == "sxk96p"
    assert row["min_speed_kmh"] == 10
    assert row["max_speed_kmh"] == 90
    assert row["avg_speed_kmh"] == 50
    assert row["vehicle_count"] == 20


def test_text_values_are_normalized():
    result = clean(raw_row(GEOHASH=" SXK96P ", AVERAGE_SPEED=" 50 "))

    assert result.rejected.empty
    assert result.clean.iloc[0]["geohash"] == "sxk96p"


@pytest.mark.parametrize(
    ("column", "value", "reason"),
    [
        ("DATE_TIME", "", "missing_value"),
        ("GEOHASH", "   ", "missing_value"),
        ("DATE_TIME", "01.10.2024 08:00", "invalid_timestamp"),
        ("DATE_TIME", "2024-11-01 08:00:00", "timestamp_outside_month"),
        ("DATE_TIME", "2024-10-01 08:30:00", "timestamp_not_on_hour"),
        ("AVERAGE_SPEED", "abc", "invalid_number"),
        ("AVERAGE_SPEED", "50.5", "invalid_number"),
        ("LATITUDE", "inf", "invalid_number"),
        ("MINIMUM_SPEED", "60", "invalid_speed_order"),
        ("AVERAGE_SPEED", "95", "invalid_speed_order"),
        ("MINIMUM_SPEED", "-1", "speed_out_of_range"),
        ("MAXIMUM_SPEED", "301", "speed_out_of_range"),
        ("NUMBER_OF_VEHICLES", "0", "vehicle_count_out_of_range"),
        ("NUMBER_OF_VEHICLES", "1000001", "vehicle_count_out_of_range"),
        ("LATITUDE", "42.0", "outside_istanbul_bounds"),
        ("LONGITUDE", "30.5", "outside_istanbul_bounds"),
        ("GEOHASH", "sxk9", "invalid_geohash"),
        ("GEOHASH", "sxk96a", "invalid_geohash"),
        ("GEOHASH", "sxk3z1", "coordinate_geohash_mismatch"),
    ],
)
def test_hard_rule_moves_row_to_quarantine(column: str, value: str, reason: str):
    result = clean(raw_row(**{column: value}))

    assert result.clean.empty
    assert result.rejected["reject_reason"].tolist() == [reason]


def test_quarantine_keeps_the_original_value():
    result = clean(raw_row(AVERAGE_SPEED="abc"))

    assert result.rejected.iloc[0]["AVERAGE_SPEED"] == "abc"


def test_zero_speed_is_allowed():
    result = clean(raw_row(MINIMUM_SPEED="0"))

    assert result.rejected.empty


def test_duplicate_inside_a_chunk_keeps_first_row():
    result = clean(raw_row(AVERAGE_SPEED="40"), raw_row(AVERAGE_SPEED="60"))

    assert result.clean["avg_speed_kmh"].tolist() == [40]
    assert result.rejected["reject_reason"].tolist() == ["duplicate_key"]


def test_duplicate_across_chunks_is_detected():
    tracker = DuplicateTracker()
    clean(raw_row(), tracker=tracker)

    result = clean(raw_row(), tracker=tracker)

    assert result.clean.empty
    assert result.rejected["reject_reason"].tolist() == ["duplicate_key"]


def test_rejected_row_does_not_block_a_later_valid_row():
    result = clean(raw_row(AVERAGE_SPEED="abc"), raw_row())

    assert len(result.clean) == 1
    assert len(result.rejected) == 1


@pytest.mark.parametrize(
    ("vehicles", "expected"),
    [("4", True), ("5", False)],
)
def test_low_sample_flag_boundary(vehicles: str, expected: bool):
    row = clean(raw_row(NUMBER_OF_VEHICLES=vehicles)).clean.iloc[0]

    assert bool(row["is_low_sample"]) is expected


@pytest.mark.parametrize(
    ("average", "expected"),
    [("150", False), ("151", True)],
)
def test_speed_outlier_flag_boundary(average: str, expected: bool):
    row = clean(raw_row(AVERAGE_SPEED=average, MAXIMUM_SPEED="200")).clean.iloc[0]

    assert bool(row["is_speed_outlier"]) is expected
    assert bool(row["is_analysis_eligible"]) is not expected


@pytest.mark.parametrize(
    ("maximum", "expected"),
    [("200", False), ("201", True)],
)
def test_suspect_max_speed_flag_boundary(maximum: str, expected: bool):
    row = clean(raw_row(MAXIMUM_SPEED=maximum)).clean.iloc[0]

    assert bool(row["is_max_speed_suspect"]) is expected
    assert bool(row["is_analysis_eligible"]) is True


@pytest.mark.parametrize(
    ("timestamp", "weekend", "holiday"),
    [
        ("2024-10-04 08:00:00", False, False),
        ("2024-10-05 08:00:00", True, False),
        ("2024-10-28 12:00:00", False, False),
        ("2024-10-28 13:00:00", False, True),
        ("2024-10-29 08:00:00", False, True),
    ],
)
def test_calendar_flags(timestamp: str, weekend: bool, holiday: bool):
    row = clean(raw_row(DATE_TIME=timestamp)).clean.iloc[0]

    assert bool(row["is_weekend"]) is weekend
    assert bool(row["is_public_holiday"]) is holiday
