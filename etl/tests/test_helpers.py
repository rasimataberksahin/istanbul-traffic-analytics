from __future__ import annotations

import pandas as pd
import pytest

from traffic_etl.geo import decode_geohash
from traffic_etl.holidays import public_holiday_mask
from traffic_etl.transform import detect_partial_hours


def hourly_frame() -> pd.DataFrame:
    index = pd.date_range("2024-10-01 00:00", "2024-10-31 23:00", freq="h")
    return pd.DataFrame({"rows": 2400, "vehicles": 400_000}, index=index)


def test_decode_geohash_matches_source_coordinates():
    cell = decode_geohash("sxk96p")

    assert cell.latitude == pytest.approx(41.0421752929688)
    assert cell.longitude == pytest.approx(28.9215087890625)


@pytest.mark.parametrize("value", ["", "sxk96a", "SXK96P"])
def test_decode_geohash_rejects_invalid_text(value: str):
    assert decode_geohash(value) is None


def test_religious_holiday_is_resolved():
    mask = public_holiday_mask(pd.DatetimeIndex(["2024-06-15 12:00", "2024-06-15 13:00", "2024-06-16 00:00"]))

    assert mask.tolist() == [False, True, True]


def test_unsupported_holiday_year_fails_loudly():
    with pytest.raises(ValueError, match="2022"):
        public_holiday_mask(pd.DatetimeIndex(["2022-10-29"]))


def test_normal_month_has_no_partial_hours():
    assert detect_partial_hours(hourly_frame()).empty


def test_partial_hour_detected_from_row_count():
    hourly = hourly_frame()
    hourly.loc["2024-10-10 10:00:00", ["rows", "vehicles"]] = [35, 275]

    assert detect_partial_hours(hourly).index.tolist() == [pd.Timestamp("2024-10-10 10:00:00")]


def test_partial_hour_detected_from_vehicles_when_row_count_is_normal():
    hourly = hourly_frame()
    hourly.loc["2024-10-10 09:00:00", "vehicles"] = 156_845

    assert detect_partial_hours(hourly).index.tolist() == [pd.Timestamp("2024-10-10 09:00:00")]


def test_low_holiday_traffic_is_not_partial():
    hourly = hourly_frame()
    hourly.loc["2024-10-29", "vehicles"] = 80_000

    assert detect_partial_hours(hourly).empty


def test_missing_cells_on_a_holiday_are_partial():
    hourly = hourly_frame()
    hourly.loc["2024-10-29 08:00:00", "rows"] = 100

    assert detect_partial_hours(hourly).index.tolist() == [pd.Timestamp("2024-10-29 08:00:00")]


def test_hour_without_enough_baseline_is_not_judged():
    hourly = hourly_frame().loc["2024-10-01":"2024-10-02"]
    hourly.loc["2024-10-01 08:00:00", "rows"] = 1

    assert detect_partial_hours(hourly).empty
