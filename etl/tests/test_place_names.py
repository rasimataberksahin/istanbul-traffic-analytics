from __future__ import annotations

import csv

import pytest

from traffic_etl import place_names
from traffic_etl.place_names import (
    Location,
    PlaceName,
    build_query,
    clean_neighborhood,
    fill_from_nearest,
    parse_response,
    read_names,
)


def test_neighbourhood_suffix_is_dropped():
    assert clean_neighborhood("Caferağa Mahallesi") == "Caferağa"
    assert clean_neighborhood("Osmanağa Mah.") == "Osmanağa"
    assert clean_neighborhood("Moda") == "Moda"
    assert clean_neighborhood(None) is None
    assert clean_neighborhood("") is None


def test_query_has_a_marker_and_lookup_per_cell():
    query = build_query([Location("sxk96p", 41.04, 28.92), Location("sxk3z1", 41.1, 28.79)])
    assert query.count("make p") == 2
    assert query.count("is_in(") == 2
    assert 'geohash="sxk3z1"' in query
    assert "is_in(41.040000,28.920000)" in query


def test_boundaries_are_grouped_under_the_preceding_marker():
    elements = [
        {"type": "p", "tags": {"geohash": "aaaaaa"}},
        {"type": "relation", "tags": {"admin_level": "6", "name": "Kadıköy"}},
        {"type": "relation", "tags": {"admin_level": "8", "name": "Caferağa Mahallesi"}},
        {"type": "p", "tags": {"geohash": "bbbbbb"}},
        {"type": "p", "tags": {"geohash": "cccccc"}},
        {"type": "relation", "tags": {"admin_level": "8", "name": "Moda Mahallesi", "name:tr": "Moda"}},
    ]
    names = parse_response(elements)
    assert names["aaaaaa"] == PlaceName("aaaaaa", "Caferağa", "Kadıköy", "osm")
    assert names["bbbbbb"].neighborhood is None and names["bbbbbb"].district is None
    assert names["cccccc"].neighborhood == "Moda"


def test_water_cells_take_the_nearest_named_cell_within_the_limit():
    locations = [
        Location("land00", 41.0000, 29.0000),
        Location("water0", 41.0000, 29.0100),  # about 0.84 km east
        Location("faraway", 41.5000, 29.0000),  # about 55 km north
    ]
    names = {
        "land00": PlaceName("land00", "Moda", "Kadıköy", "osm"),
        "water0": PlaceName("water0", None, None, "osm"),
    }
    assert fill_from_nearest(locations, names) == 1
    assert names["water0"] == PlaceName("water0", "Moda", "Kadıköy", "nearest")
    assert "faraway" not in names


def test_committed_names_cover_every_row(tmp_path):
    path = tmp_path / "names.csv"
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["geohash", "neighborhood", "district", "source"])
        writer.writerow(["sxk96p", "Merkezefendi", "Zeytinburnu", "osm"])
        writer.writerow(["sxk3z1", "", "", "none"])
    assert read_names(path) == [("sxk96p", "Merkezefendi", "Zeytinburnu"), ("sxk3z1", None, None)]


@pytest.mark.skipif(not place_names.NAMES_PATH.exists(), reason="names file has not been built")
def test_names_file_is_well_formed():
    rows = read_names()
    geohashes = [row[0] for row in rows]
    assert len(geohashes) == len(set(geohashes))
    assert all(len(geohash) == 6 for geohash in geohashes)
    named = [row for row in rows if row[1] and row[2]]
    assert len(named) / len(rows) > 0.95
