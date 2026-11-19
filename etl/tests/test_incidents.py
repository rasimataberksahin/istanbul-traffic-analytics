from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from traffic_etl.geo import decode_geohash, encode_geohash
from traffic_etl.incidents import (
    NamedCells,
    nearest_names,
    parse_closed_lanes,
    parse_first,
    parse_road,
    parse_segment,
    parse_severity,
    LANES,
    LANDMARKS,
    transform,
)

COLUMNS = [
    "announcement_id",
    "announcement_starting_datetime",
    "announcement_ending_datetime",
    "announcement_title",
    "announcement_type_desc",
    "intervention_datetime",
    "accident_type",
    "accident_description",
    "closed_lane",
    "latitude",
    "longitude",
]


def raw_row(**overrides: str) -> dict[str, str]:
    row = {
        "announcement_id": "1",
        "announcement_starting_datetime": "2026-10-31 01:42:49.120",
        "announcement_ending_datetime": "2026-10-31 02:11:00",
        "announcement_title": "D100 Acıbadem-Altunizade Yönü, sol şerit trafik kazası (hasarlı).",
        "announcement_type_desc": "Kaza Bildirimi",
        "intervention_datetime": "2026-10-31 02:11:00.000",
        "accident_type": "trafik kazası (hasarlı)",
        "accident_description": "Kazaya müdahale ediliyor.",
        "closed_lane": "1",
        "latitude": "41.015222",
        "longitude": "29.05657",
    }
    return row | overrides


def cells() -> NamedCells:
    centre = decode_geohash("sxk9m4")
    return NamedCells(
        np.array(["sxk9m4"]),
        np.array([centre.latitude]),
        np.array([centre.longitude]),
        np.array(["Altunizade"], dtype=object),
        np.array(["Üsküdar"], dtype=object),
    )


def run(*rows: dict[str, str]):
    return transform(pd.DataFrame(list(rows), columns=COLUMNS), cells())


@pytest.mark.parametrize(
    ("title", "road", "segment"),
    [
        ("D100 Acıbadem-Altunizade Yönü, sol şerit trafik kazası (hasarlı).", "D100", "Acıbadem - Altunizade"),
        ("Sahil Yolu Samatya-Yenikapı Yönü, sol şerit trafik kazası (zincirleme).", "Sahil Yolu", "Samatya - Yenikapı"),
        ("Basın Ekspres Sefaköy-Kuyumcukent Yönü, sağ şerit", "Basın Ekspres Yolu", "Sefaköy - Kuyumcukent"),
        ("TEM  Dudullu Kavşak-Ataşehir Yönü, sol şerit", "TEM", "Dudullu Kavşak - Ataşehir"),
        ("D100 Merter(yanyol)-İncirli Yönü Trafik kazası", "D100", "Merter - İncirli"),
        ("Unkapanı-Saraçhane Yönü, sol şerit trafik kazası", None, "Unkapanı - Saraçhane"),
        ("Haber", None, None),
    ],
)
def test_titles_give_road_and_segment(title, road, segment):
    assert parse_road(title) == road
    assert parse_segment(title) == segment


def test_severity_prefers_the_accident_type_and_falls_back_to_the_title():
    assert parse_severity("trafik kazası (can kaybı)", "") == "fatal"
    assert parse_severity("Seçiniz", "TEM ... trafik kazası (yaralanmalı)") == "injury"
    assert parse_severity("", "D100 ... Trafik kazası (zincirleme)") == "chain"
    assert parse_severity("Bilgi yok", "D100 kaza") == "unknown"


def test_a_named_lane_wins_over_a_closure_phrase():
    assert parse_first(LANES, "D100 X-Y Yönü, sağ şerit trafiğe kapalı") == "right"
    assert parse_first(LANES, "TEM X-Y Yönü yol trafiğe kapatıldı") == "all"
    assert parse_first(LANES, "TEM X-Y Yönü emniyet şeridinde araç arızası") == "shoulder"
    assert parse_first(LANDMARKS, "D100 Zincirlikuyu-15 Temmuz Sehitler Köprüsü Yönü") == "15 Temmuz Şehitler Köprüsü"


def test_lane_codes_without_a_count_are_empty():
    assert parse_closed_lanes("2") == 2
    assert parse_closed_lanes("1.0") == 1
    assert parse_closed_lanes("0") is None
    assert parse_closed_lanes("-1") is None
    assert parse_closed_lanes("") is None


def test_rows_outside_istanbul_and_duplicates_are_quarantined():
    clean, rejected, report = run(
        raw_row(),
        raw_row(announcement_id="2", latitude="39.9", longitude="32.8"),
        raw_row(),
    )
    assert len(clean) == 1
    assert sorted(rejected["reject_reason"]) == ["duplicate_id", "outside_istanbul"]
    assert report["rows"]["raw_equals_clean_plus_quarantined"]


def test_categories_severity_and_both_timestamp_formats():
    clean, _, _ = run(
        raw_row(),
        raw_row(
            announcement_id="2",
            announcement_type_desc="Araç Arızası",
            announcement_title="TEM X-Y Yönü, sağ şerit araç arızası.",
            accident_type="",
            closed_lane="",
        ),
        raw_row(announcement_id="3", announcement_type_desc="İDO Sefer Bildirisi", announcement_title="İDO seferleri iptal"),
    )
    by_id = clean.set_index("incident_id")
    assert by_id.loc[1, "category"] == "accident"
    assert by_id.loc[1, "severity"] == "damage"
    assert by_id.loc[1, "duration_min"] == pytest.approx(28.2)
    # The intervention time equals the closing time, so it is not a response time.
    assert np.isnan(by_id.loc[1, "response_min"])
    assert by_id.loc[2, "category"] == "breakdown"
    assert by_id.loc[2, "severity"] is None
    assert by_id.loc[3, "category"] == "other"


def test_only_an_intervention_before_closure_is_a_response_time():
    clean, _, report = run(raw_row(intervention_datetime="2026-10-31 01:52:49"))
    assert clean["response_min"].iloc[0] == pytest.approx(10.0)
    assert report["flags"]["response_recorded"] == 1


def test_implausible_durations_are_kept_but_not_used():
    clean, rejected, report = run(
        raw_row(announcement_ending_datetime="2026-10-30 01:00:00"),
        raw_row(announcement_id="2", announcement_ending_datetime="2026-11-30 01:00:00"),
        raw_row(announcement_id="3", announcement_ending_datetime="2026-10-31 01:42:50"),
    )
    assert len(rejected) == 0
    assert clean["duration_min"].isna().all()
    assert clean["is_duration_invalid"].all()
    assert report["flags"]["invalid_duration"] == 3


def test_incidents_take_the_cell_and_name_they_fall_in():
    clean, _, _ = run(raw_row(), raw_row(announcement_id="2", latitude="41.20", longitude="28.30"))
    by_id = clean.set_index("incident_id")
    assert by_id.loc[1, "geohash"] == "sxk9m4"
    assert by_id.loc[1, "neighborhood"] == "Altunizade"
    assert by_id.loc[2, "district"] is None


def test_nearest_names_respect_the_distance_limit():
    centre = decode_geohash("sxk9m4")
    neighborhoods, districts, distances = nearest_names(
        np.array([centre.latitude + 0.005, centre.latitude + 0.05]),
        np.array([centre.longitude, centre.longitude]),
        cells(),
    )
    assert list(districts) == ["Üsküdar", None]
    assert distances[0] < 1.5 < distances[1]


def test_geohash_encoding_round_trips():
    for geohash in ["sxk973", "sxk9m4", "sx7cmz"]:
        centre = decode_geohash(geohash)
        assert encode_geohash(centre.latitude, centre.longitude) == geohash
