"""Run the analytical SQL files and save each result as CSV.

    python -m traffic_etl.analyze
"""

from __future__ import annotations

import argparse
import csv
import logging
import time
from pathlib import Path

import psycopg

from traffic_etl.config import ANALYSIS_RESULTS_DIR, ANALYSIS_SQL_DIR
from traffic_etl.load import get_database_url

logger = logging.getLogger("traffic_etl.analyze")


def run_analysis(
    database_url: str,
    sql_dir: Path = ANALYSIS_SQL_DIR,
    output_dir: Path = ANALYSIS_RESULTS_DIR,
) -> dict[str, int]:
    """Execute every query in a read-only transaction and return its row count."""
    output_dir.mkdir(parents=True, exist_ok=True)
    row_counts: dict[str, int] = {}

    with psycopg.connect(database_url) as connection:
        connection.read_only = True
        for path in sorted(sql_dir.glob("*.sql")):
            started = time.perf_counter()
            cursor = connection.execute(path.read_text(encoding="utf-8"))
            rows = cursor.fetchall()
            columns = [column.name for column in cursor.description]

            with (output_dir / f"{path.stem}.csv").open(
                "w", encoding="utf-8", newline=""
            ) as file:
                writer = csv.writer(file, lineterminator="\n")
                writer.writerow(columns)
                writer.writerows(rows)

            row_counts[path.stem] = len(rows)
            logger.info(
                "%s: %d rows in %.0f ms.",
                path.stem,
                len(rows),
                (time.perf_counter() - started) * 1000,
            )
    return row_counts


def main() -> None:
    argparse.ArgumentParser(description=__doc__.splitlines()[0]).parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    run_analysis(get_database_url())


if __name__ == "__main__":
    main()
