"""Integration tests. Each test runs in its own temporary PostgreSQL database."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from psycopg import conninfo, errors

from conftest import month_rows, write_raw_csv
from traffic_etl import load as load_module
from traffic_etl.analyze import run_analysis
from traffic_etl.config import ANALYSIS_SQL_DIR
from traffic_etl.holidays import RELIGIOUS_FULL_DAYS, holiday_dates
from traffic_etl.load import (
    LoadReconciliationError,
    apply_schema,
    get_database_url,
    load_month,
)
from traffic_etl.transform import run_transform

pytestmark = pytest.mark.integration

MONTH = "2024-10"
PARTITION = "traffic.fact_traffic_hourly_y2024m10"
VALID_FACT = """
INSERT INTO traffic.fact_traffic_hourly (
    observed_at, location_id, min_speed_kmh, max_speed_kmh, avg_speed_kmh, vehicle_count,
    is_weekend, is_public_holiday, is_low_sample, is_speed_outlier, is_max_speed_suspect,
    is_partial_hour, is_analysis_eligible
) VALUES (%s, 1, %s, %s, %s, %s, false, false, false, false, false, false, true)
"""


def build_parquet(root: Path, rows: list[dict[str, str]]) -> Path:
    raw_dir = root / "raw"
    processed_dir = root / "processed"
    raw_dir.mkdir(parents=True)
    write_raw_csv(raw_dir, rows)
    run_transform(MONTH, raw_dir, processed_dir, root / "reports", chunk_size=500)
    return processed_dir


@pytest.fixture(scope="module")
def processed_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return build_parquet(tmp_path_factory.mktemp("full"), month_rows())


@pytest.fixture
def database_url() -> Iterator[str]:
    try:
        admin_url = get_database_url()
        admin = psycopg.connect(admin_url, autocommit=True, connect_timeout=3)
    except (RuntimeError, psycopg.OperationalError) as error:
        pytest.skip(f"PostgreSQL is not available: {error}")

    name = f"traffic_test_{uuid.uuid4().hex[:12]}"
    with admin:
        admin.execute(f'CREATE DATABASE "{name}"')
        try:
            yield conninfo.make_conninfo(admin_url, dbname=name)
        finally:
            admin.execute(f'DROP DATABASE "{name}" WITH (FORCE)')


def scalar(url: str, query: str):
    with psycopg.connect(url) as connection:
        return connection.execute(query).fetchone()[0]


def test_load_reconciles_with_the_source(database_url, processed_dir):
    result = load_month(MONTH, database_url, processed_dir)

    assert result.status == "loaded"
    assert result.rows == len(month_rows())
    assert result.location_count == 3
    assert scalar(database_url, f"SELECT COUNT(*) FROM {PARTITION}") == result.rows
    assert scalar(database_url, f"SELECT SUM(vehicle_count) FROM {PARTITION}") == result.vehicle_total
    assert scalar(database_url, "SELECT row_count FROM traffic.load_audit") == result.rows


def test_generated_columns_are_correct(database_url, processed_dir):
    load_month(MONTH, database_url, processed_dir)

    wrong = scalar(
        database_url,
        """
        SELECT COUNT(*) FROM traffic.fact_traffic_hourly
        WHERE date_key <> observed_at::date
           OR hour_of_day <> EXTRACT(HOUR FROM observed_at)
           OR speed_volume <> avg_speed_kmh * vehicle_count
        """,
    )

    assert wrong == 0


def test_calendar_covers_the_month(database_url, processed_dir):
    load_month(MONTH, database_url, processed_dir)

    assert scalar(database_url, "SELECT COUNT(*) FROM traffic.dim_date") == 31
    assert scalar(database_url, "SELECT COUNT(*) FROM traffic.dim_date WHERE is_weekend") == 8
    assert (
        scalar(database_url, "SELECT day_name FROM traffic.dim_date WHERE date_key = '2024-10-29'")
        == "Salı"
    )


def test_second_load_of_the_same_file_is_skipped(database_url, processed_dir):
    first = load_month(MONTH, database_url, processed_dir)
    loaded_at = scalar(database_url, "SELECT loaded_at FROM traffic.load_audit")

    second = load_month(MONTH, database_url, processed_dir)

    assert second.status == "skipped"
    assert second.rows == first.rows
    assert scalar(database_url, "SELECT loaded_at FROM traffic.load_audit") == loaded_at


def test_forced_load_does_not_duplicate_rows(database_url, processed_dir):
    first = load_month(MONTH, database_url, processed_dir)

    second = load_month(MONTH, database_url, processed_dir, force=True)

    assert second.status == "loaded"
    assert scalar(database_url, f"SELECT COUNT(*) FROM {PARTITION}") == first.rows


def test_changed_file_replaces_the_month(database_url, processed_dir, tmp_path):
    load_month(MONTH, database_url, processed_dir)
    smaller = [row for row in month_rows() if row["GEOHASH"] != "sxk1v2"]
    smaller_dir = build_parquet(tmp_path, smaller)

    result = load_month(MONTH, database_url, smaller_dir)

    assert result.status == "loaded"
    assert scalar(database_url, f"SELECT COUNT(*) FROM {PARTITION}") == len(smaller)


def test_failed_load_keeps_the_previous_data(database_url, processed_dir, tmp_path, monkeypatch):
    first = load_month(MONTH, database_url, processed_dir)
    smaller = [row for row in month_rows() if row["GEOHASH"] != "sxk1v2"]
    smaller_dir = build_parquet(tmp_path, smaller)

    def fail(*args, **kwargs):
        raise LoadReconciliationError("totals differ")

    monkeypatch.setattr(load_module, "_assert_reconciled", fail)

    with pytest.raises(LoadReconciliationError, match="totals differ"):
        load_month(MONTH, database_url, smaller_dir)

    assert scalar(database_url, f"SELECT COUNT(*) FROM {PARTITION}") == first.rows
    assert scalar(database_url, "SELECT row_count FROM traffic.load_audit") == first.rows


@pytest.mark.parametrize(
    ("observed_at", "minimum", "maximum", "average", "vehicles", "error"),
    [
        ("2024-10-01 00:00:00", 10, 90, 50, 5, errors.UniqueViolation),
        ("2024-10-01 00:30:00", 10, 90, 50, 5, errors.CheckViolation),
        ("2024-10-02 00:00:00", 60, 90, 50, 5, errors.CheckViolation),
        ("2024-10-02 00:00:00", 10, 301, 50, 5, errors.CheckViolation),
        ("2024-10-02 00:00:00", 10, 90, 50, 0, errors.CheckViolation),
    ],
)
def test_database_rejects_invalid_rows(
    database_url, processed_dir, observed_at, minimum, maximum, average, vehicles, error
):
    load_month(MONTH, database_url, processed_dir)

    with psycopg.connect(database_url) as connection, pytest.raises(error):
        connection.execute(VALID_FACT, (observed_at, minimum, maximum, average, vehicles))


def test_database_rejects_a_month_without_partition(database_url, processed_dir):
    load_month(MONTH, database_url, processed_dir)

    with psycopg.connect(database_url) as connection, pytest.raises(errors.CheckViolation):
        connection.execute(VALID_FACT, ("2024-11-01 00:00:00", 10, 90, 50, 5))


def test_schema_can_be_applied_twice(database_url):
    with psycopg.connect(database_url) as connection:
        apply_schema(connection)
        apply_schema(connection)


def test_analysis_queries_run_and_return_rows(database_url, processed_dir, tmp_path):
    load_month(MONTH, database_url, processed_dir)

    row_counts = run_analysis(database_url, output_dir=tmp_path)

    assert len(row_counts) == len(list(ANALYSIS_SQL_DIR.glob("*.sql"))) >= 10
    assert row_counts["01_city_kpis"] == 1
    assert row_counts["02_hourly_profile"] == 24
    assert all((tmp_path / f"{name}.csv").exists() for name in row_counts)


def test_aggregates_match_the_facts(database_url, processed_dir):
    load_month(MONTH, database_url, processed_dir)

    with psycopg.connect(database_url) as connection:
        facts = connection.execute(
            """
            SELECT COUNT(*), SUM(vehicle_count), SUM(speed_volume), COUNT(DISTINCT observed_at)
            FROM traffic.fact_traffic_hourly WHERE is_analysis_eligible
            """
        ).fetchone()
        city = connection.execute(
            """
            SELECT SUM(eligible_row_count), SUM(vehicle_count), SUM(speed_volume),
                   COUNT(*) FILTER (WHERE eligible_row_count > 0)
            FROM traffic.agg_city_hourly
            """
        ).fetchone()
        bands = connection.execute(
            "SELECT SUM(row_count), SUM(vehicle_count) FROM traffic.agg_city_speed_band"
        ).fetchone()
        locations = connection.execute(
            "SELECT SUM(observed_hours), SUM(vehicle_count), SUM(speed_volume) FROM traffic.agg_location_daily"
        ).fetchone()

    assert city == facts
    assert bands == facts[:2]
    assert locations == facts[:3]


def test_location_peak_and_night_sums_follow_the_rules(database_url, processed_dir):
    load_month(MONTH, database_url, processed_dir)

    with psycopg.connect(database_url) as connection:
        expected = connection.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE hour_of_day BETWEEN 1 AND 4),
                COUNT(*) FILTER (WHERE hour_of_day BETWEEN 17 AND 19
                                   AND NOT is_weekend AND NOT is_public_holiday)
            FROM traffic.fact_traffic_hourly
            WHERE is_analysis_eligible AND NOT is_low_sample
            """
        ).fetchone()
        actual = connection.execute(
            "SELECT SUM(night_hours), SUM(peak_hours) FROM traffic.agg_location_daily"
        ).fetchone()

    assert actual == expected


def test_skipped_load_rebuilds_missing_aggregates(database_url, processed_dir):
    load_month(MONTH, database_url, processed_dir)
    with psycopg.connect(database_url) as connection:
        connection.execute("DELETE FROM traffic.agg_city_hourly")
        connection.execute("DELETE FROM traffic.agg_location_daily")

    result = load_month(MONTH, database_url, processed_dir)

    assert result.status == "skipped"
    assert scalar(database_url, "SELECT COUNT(*) FROM traffic.agg_city_hourly") > 0
    assert scalar(database_url, "SELECT COUNT(*) FROM traffic.agg_location_daily") > 0


def test_calendar_holidays_match_the_etl_calendar(database_url):
    with psycopg.connect(database_url) as connection:
        apply_schema(connection)
        rows = connection.execute(
            """
            SELECT d::date
            FROM traffic.calendar_period AS p,
                 generate_series(p.start_date, p.end_date, INTERVAL '1 day') AS d
            WHERE p.kind = 'public_holiday'
            ORDER BY 1
            """
        ).fetchall()

    full_days, _ = holiday_dates(sorted(RELIGIOUS_FULL_DAYS))

    assert sorted({row[0] for row in rows}) == sorted(set(full_days.date))


def test_load_applies_place_names(database_url, processed_dir, tmp_path, monkeypatch):
    names = tmp_path / "names.csv"
    names.write_text(
        "geohash,neighborhood,district,source\nsxk96p,Merkezefendi,Zeytinburnu,osm\n",
        encoding="utf-8",
    )
    monkeypatch.setattr("traffic_etl.place_names.NAMES_PATH", names)
    load_month(MONTH, database_url, processed_dir)

    with psycopg.connect(database_url) as connection:
        rows = dict(
            connection.execute(
                "SELECT geohash, coalesce(neighborhood || ', ' || district, '') FROM traffic.dim_location"
            ).fetchall()
        )
    assert rows["sxk96p"] == "Merkezefendi, Zeytinburnu"
    assert rows["sxk3z1"] == ""
