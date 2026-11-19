"""Load one clean monthly Parquet file into PostgreSQL.

    python -m traffic_etl.load --month 2024-10

The month is replaced inside a single transaction. A failed load rolls back and
leaves the previously loaded data untouched. A file that is already loaded is
skipped unless ``--force`` is used.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import psycopg
import pyarrow.compute as pc
import pyarrow.csv as pa_csv
import pyarrow.parquet as pq
from dotenv import load_dotenv
from psycopg import sql

from traffic_etl.config import CLEAN_SCHEMA, PROCESSED_DIR, PROJECT_ROOT, SCHEMA_DIR

logger = logging.getLogger("traffic_etl.load")

STAGE_DDL = """
CREATE TEMP TABLE stage_traffic (
    observed_at          timestamp(0)     NOT NULL,
    geohash              char(6)          NOT NULL,
    latitude             double precision NOT NULL,
    longitude            double precision NOT NULL,
    min_speed_kmh        smallint         NOT NULL,
    max_speed_kmh        smallint         NOT NULL,
    avg_speed_kmh        smallint         NOT NULL,
    vehicle_count        integer          NOT NULL,
    is_weekend           boolean          NOT NULL,
    is_public_holiday    boolean          NOT NULL,
    is_low_sample        boolean          NOT NULL,
    is_speed_outlier     boolean          NOT NULL,
    is_max_speed_suspect boolean          NOT NULL,
    is_partial_hour      boolean          NOT NULL,
    is_analysis_eligible boolean          NOT NULL
) ON COMMIT DROP
"""

INSERT_LOCATIONS = """
INSERT INTO traffic.dim_location (geohash, latitude, longitude)
SELECT DISTINCT geohash, latitude, longitude
FROM stage_traffic
ON CONFLICT (geohash) DO NOTHING
"""

COUNT_LOCATION_CONFLICTS = """
SELECT COUNT(DISTINCT s.geohash)
FROM stage_traffic AS s
JOIN traffic.dim_location AS l USING (geohash)
WHERE s.latitude <> l.latitude OR s.longitude <> l.longitude
"""

INSERT_FACTS = """
INSERT INTO traffic.fact_traffic_hourly (
    observed_at, location_id, min_speed_kmh, max_speed_kmh, avg_speed_kmh, vehicle_count,
    is_weekend, is_public_holiday, is_low_sample, is_speed_outlier, is_max_speed_suspect,
    is_partial_hour, is_analysis_eligible
)
SELECT s.observed_at, l.location_id, s.min_speed_kmh, s.max_speed_kmh, s.avg_speed_kmh, s.vehicle_count,
       s.is_weekend, s.is_public_holiday, s.is_low_sample, s.is_speed_outlier, s.is_max_speed_suspect,
       s.is_partial_hour, s.is_analysis_eligible
FROM stage_traffic AS s
JOIN traffic.dim_location AS l USING (geohash)
"""

UPSERT_AUDIT = """
INSERT INTO traffic.load_audit (month, source_file, source_sha256, row_count, vehicle_total, location_count)
VALUES (%(month)s, %(file)s, %(sha256)s, %(rows)s, %(vehicles)s, %(locations)s)
ON CONFLICT (month) DO UPDATE
SET source_file = EXCLUDED.source_file,
    source_sha256 = EXCLUDED.source_sha256,
    row_count = EXCLUDED.row_count,
    vehicle_total = EXCLUDED.vehicle_total,
    location_count = EXCLUDED.location_count,
    loaded_at = now()
"""


REFRESH_AGGREGATES = "SELECT traffic.refresh_month_aggregates(%s)"
AGGREGATE_TABLES = ("agg_city_hourly", "agg_city_speed_band", "agg_location_daily")


def _has_aggregates(connection: psycopg.Connection, month_start: date) -> bool:
    return connection.execute(
        """
        SELECT EXISTS (
            SELECT 1 FROM traffic.agg_city_hourly
            WHERE observed_at >= %(month)s AND observed_at < %(month)s + INTERVAL '1 month'
        )
        """,
        {"month": month_start},
    ).fetchone()[0]


class LoadReconciliationError(RuntimeError):
    """Raised when the database does not match the source file."""


@dataclass(frozen=True)
class LoadResult:
    month: str
    status: str
    rows: int
    vehicle_total: int
    location_count: int


def get_database_url() -> str:
    load_dotenv(PROJECT_ROOT / ".env")
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env first.")
    return url


def apply_schema(connection: psycopg.Connection) -> None:
    for path in sorted(SCHEMA_DIR.glob("*.sql")):
        connection.execute(path.read_text(encoding="utf-8"))


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _copy_to_stage(connection: psycopg.Connection, parquet_path: Path) -> tuple[int, int]:
    """Stream the Parquet file into the staging table and return its totals."""
    rows = vehicles = 0
    options = pa_csv.WriteOptions(include_header=False, quoting_style="needed")
    copy_sql = sql.SQL("COPY stage_traffic ({}) FROM STDIN WITH (FORMAT csv)").format(
        sql.SQL(", ").join(sql.Identifier(name) for name in CLEAN_SCHEMA.names)
    )

    with (
        pq.ParquetFile(parquet_path) as parquet_file,
        connection.cursor() as cursor,
        cursor.copy(copy_sql) as copy,
    ):
        for group in range(parquet_file.num_row_groups):
            table = parquet_file.read_row_group(group)
            buffer = io.BytesIO()
            pa_csv.write_csv(table, buffer, options)
            copy.write(buffer.getvalue())
            rows += table.num_rows
            vehicles += pc.sum(table["vehicle_count"].cast("int64")).as_py()
    return rows, vehicles


def _assert_reconciled(
    connection: psycopg.Connection,
    partition: sql.Composable,
    expected_rows: int,
    expected_vehicles: int,
) -> int:
    """Compare the loaded partition with the source totals."""
    query = sql.SQL(
        "SELECT COUNT(*), COALESCE(SUM(vehicle_count), 0), COUNT(DISTINCT location_id) FROM {}"
    ).format(partition)
    rows, vehicles, locations = connection.execute(query).fetchone()
    if rows != expected_rows or vehicles != expected_vehicles:
        raise LoadReconciliationError(
            f"Expected {expected_rows} rows and {expected_vehicles} vehicles, "
            f"found {rows} rows and {vehicles} vehicles."
        )
    return locations


def load_month(
    month: str,
    database_url: str,
    processed_dir: Path = PROCESSED_DIR,
    force: bool = False,
) -> LoadResult:
    """Load one ``YYYY-MM`` month and return what happened."""
    month_start = date(int(month[:4]), int(month[5:]), 1)
    parquet_path = processed_dir / f"traffic_clean_{month.replace('-', '')}.parquet"
    checksum = _sha256(parquet_path)

    with psycopg.connect(database_url) as connection:
        apply_schema(connection)

        audit = connection.execute(
            """
            SELECT source_sha256, row_count, vehicle_total, location_count
            FROM traffic.load_audit
            WHERE month = %s
            """,
            (month_start,),
        ).fetchone()
        if audit and audit[0] == checksum and not force:
            if not _has_aggregates(connection, month_start):
                connection.execute(REFRESH_AGGREGATES, (month_start,))
                logger.info("%s aggregates were rebuilt.", parquet_path.name)
            logger.info("%s is already loaded.", parquet_path.name)
            return LoadResult(month, "skipped", audit[1], audit[2], audit[3])

        partition_name = connection.execute(
            "SELECT traffic.ensure_month(%s)", (month_start,)
        ).fetchone()[0]
        partition = sql.Identifier("traffic", partition_name)

        connection.execute(STAGE_DDL)
        rows, vehicles = _copy_to_stage(connection, parquet_path)
        if rows == 0:
            raise LoadReconciliationError(f"{parquet_path.name} has no rows.")

        connection.execute(INSERT_LOCATIONS)
        conflicts = connection.execute(COUNT_LOCATION_CONFLICTS).fetchone()[0]
        if conflicts:
            raise LoadReconciliationError(f"{conflicts} geohashes changed their coordinates.")

        connection.execute(sql.SQL("TRUNCATE {}").format(partition))
        connection.execute(INSERT_FACTS)
        locations = _assert_reconciled(connection, partition, rows, vehicles)
        connection.execute(REFRESH_AGGREGATES, (month_start,))

        connection.execute(
            UPSERT_AUDIT,
            {
                "month": month_start,
                "file": parquet_path.name,
                "sha256": checksum,
                "rows": rows,
                "vehicles": vehicles,
                "locations": locations,
            },
        )
        connection.execute("ANALYZE traffic.dim_location")
        connection.execute("ANALYZE traffic.dim_date")

    # VACUUM cannot run in a transaction. It enables index-only scans on the new data.
    with psycopg.connect(database_url, autocommit=True) as connection:
        connection.execute(sql.SQL("VACUUM (ANALYZE) {}").format(partition))
        for table in AGGREGATE_TABLES:
            connection.execute(sql.SQL("VACUUM (ANALYZE) {}").format(sql.Identifier("traffic", table)))

    return LoadResult(month, "loaded", rows, vehicles, locations)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--month", required=True, help="YYYY-MM")
    parser.add_argument("--force", action="store_true", help="Reload an already loaded file")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", args.month):
        parser.error("Month must use the YYYY-MM format.")

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    started = time.perf_counter()
    result = load_month(args.month, get_database_url(), force=args.force)
    logger.info(
        "%s %s: %s rows, %s locations in %.0f s.",
        result.month,
        result.status,
        f"{result.rows:,}",
        f"{result.location_count:,}",
        time.perf_counter() - started,
    )


if __name__ == "__main__":
    main()
