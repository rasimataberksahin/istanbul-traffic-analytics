"""Run the whole pipeline for a range of months: extract, transform and load.

    python -m traffic_etl.run --from 2023-01 --to 2025-01

After the months are loaded, the hourly weather of the same range is fetched from
Open-Meteo (skip with --skip-weather). --incidents also refreshes the incident history.

Every step is idempotent. A verified download is not fetched again, an existing
Parquet file is not rebuilt and an unchanged file is not loaded twice, so a
failed run can simply be started again.
"""

from __future__ import annotations

import argparse
import calendar
import logging
import re
import time
from datetime import date

from traffic_etl.config import PROCESSED_DIR, RAW_DIR
from traffic_etl.extract import extract_month
from traffic_etl.load import get_database_url, load_month
from traffic_etl.transform import run_transform
from traffic_etl.weather import load_weather

logger = logging.getLogger("traffic_etl.run")

MONTH_PATTERN = re.compile(r"\d{4}-(0[1-9]|1[0-2])")


def month_range(first: str, last: str) -> list[str]:
    """Every ``YYYY-MM`` month from ``first`` to ``last``, both included."""
    for value in (first, last):
        if not MONTH_PATTERN.fullmatch(value):
            raise ValueError(f"{value!r} is not a YYYY-MM month.")
    if last < first:
        raise ValueError("The last month must not be earlier than the first month.")

    year, month = int(first[:4]), int(first[5:])
    months: list[str] = []
    while f"{year:04d}-{month:02d}" <= last:
        months.append(f"{year:04d}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def run_month(month: str, database_url: str, force: bool = False) -> str:
    """Process one month and return the load status."""
    extract_month(month.replace("-", ""), RAW_DIR, force=False)

    parquet_path = PROCESSED_DIR / f"traffic_clean_{month.replace('-', '')}.parquet"
    if force or not parquet_path.exists():
        run_transform(month)
    else:
        logger.info("%s already exists.", parquet_path.name)

    return load_month(month, database_url, force=force).status


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--from", dest="first", required=True, help="First month, YYYY-MM")
    parser.add_argument("--to", dest="last", help="Last month, YYYY-MM. Defaults to --from.")
    parser.add_argument("--force", action="store_true", help="Rebuild and reload existing months")
    parser.add_argument("--skip-weather", action="store_true", help="Do not fetch hourly weather from Open-Meteo")
    parser.add_argument("--incidents", action="store_true", help="Also refresh the traffic incident history (UYM)")
    args = parser.parse_args()

    try:
        months = month_range(args.first, args.last or args.first)
    except ValueError as error:
        parser.error(str(error))

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    database_url = get_database_url()
    started = time.perf_counter()
    for month in months:
        month_started = time.perf_counter()
        status = run_month(month, database_url, args.force)
        logger.info("%s %s in %.0f s.", month, status, time.perf_counter() - month_started)
    logger.info("%d months processed in %.0f s.", len(months), time.perf_counter() - started)

    if not args.skip_weather:
        first_day = date.fromisoformat(f"{months[0]}-01")
        year, month = (int(part) for part in months[-1].split("-"))
        last_day = date(year, month, calendar.monthrange(year, month)[1])
        try:
            load_weather(database_url, first_day, last_day)
        except OSError as error:
            # Weather enriches the analysis but is not needed to load traffic.
            logger.warning("Weather could not be loaded (%s). Run python -m traffic_etl.weather later.", error)

    if args.incidents:
        from traffic_etl.incidents import run_pipeline

        status = run_pipeline(database_url, force=args.force, skip_weather=args.skip_weather)
        logger.info("Incidents %s.", status)


if __name__ == "__main__":
    main()
