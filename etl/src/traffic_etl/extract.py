"""Download one month of IBB hourly traffic density data.

The download URL is resolved from the IBB open data (CKAN) catalog instead of
being hard-coded, so the same command works for every published month:

    python -m traffic_etl.extract --month 2024-10

Each run writes two files to ``data/raw``:

* ``traffic_density_YYYYMM.csv``: the untouched source file
* ``traffic_density_YYYYMM.manifest.json``: source, size and SHA-256 checksum

The step is idempotent. A file that matches its manifest is not downloaded again.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

CATALOG_URL = (
    "https://data.ibb.gov.tr/api/3/action/package_show"
    "?id=hourly-traffic-density-data-set"
)
USER_AGENT = "istanbul-traffic-analytics-etl/0.1"
CHUNK_SIZE_BYTES = 1024 * 1024
REQUEST_TIMEOUT_SECONDS = 60
MAX_ATTEMPTS = 3
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "raw"

logger = logging.getLogger("traffic_etl.extract")


@dataclass(frozen=True)
class CatalogResource:
    """The catalog fields needed to download and audit one monthly file."""

    resource_id: str
    name: str
    url: str
    catalog_size_bytes: int | None
    last_modified: str | None


@dataclass(frozen=True)
class DownloadManifest:
    """Audit record stored next to the raw file."""

    month: str
    file_name: str
    source_url: str
    resource_id: str
    resource_name: str
    source_last_modified: str | None
    catalog_size_bytes: int | None
    size_bytes: int
    sha256: str
    downloaded_at_utc: str


def parse_month(value: str) -> str:
    """Validate ``YYYY-MM`` and return it in ``YYYYMM`` form."""
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value):
        raise argparse.ArgumentTypeError("Month must use the YYYY-MM format.")
    return value.replace("-", "")


def open_url(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS)


def read_catalog() -> dict:
    """Fetch the catalog. The portal sometimes answers 5xx, so failures are retried."""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with open_url(CATALOG_URL) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == MAX_ATTEMPTS:
                raise
            wait_seconds = 5 * attempt
            logger.warning(
                "Catalog request %d/%d failed (%s). Retrying in %d s.",
                attempt,
                MAX_ATTEMPTS,
                error,
                wait_seconds,
            )
            time.sleep(wait_seconds)
    raise AssertionError("unreachable")


def find_resource(month: str) -> CatalogResource:
    """Return the catalog entry of the requested ``YYYYMM`` month."""
    catalog = read_catalog()

    if not catalog.get("success"):
        raise RuntimeError("The IBB catalog returned an unsuccessful response.")

    expected_name = f"traffic_density_{month}.csv"
    for resource in catalog["result"]["resources"]:
        if resource["url"].rsplit("/", 1)[-1] == expected_name:
            return CatalogResource(
                resource_id=resource["id"],
                name=resource["name"],
                url=resource["url"],
                catalog_size_bytes=resource.get("size"),
                last_modified=resource.get("last_modified"),
            )
    raise LookupError(f"{expected_name} is not published in the IBB catalog.")


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(CHUNK_SIZE_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


def is_already_downloaded(csv_path: Path, manifest_path: Path) -> bool:
    """Trust an existing file only when it still matches its manifest."""
    if not csv_path.exists() or not manifest_path.exists():
        return False
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return (
        csv_path.stat().st_size == manifest["size_bytes"]
        and sha256_of(csv_path) == manifest["sha256"]
    )


def download_file(url: str, destination: Path) -> None:
    """Stream to a ``.part`` file so a failed run never leaves a partial CSV."""
    partial_path = destination.with_suffix(destination.suffix + ".part")

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with open_url(url) as response, partial_path.open("wb") as output:
                expected = response.headers.get("Content-Length")
                written = 0
                while chunk := response.read(CHUNK_SIZE_BYTES):
                    output.write(chunk)
                    written += len(chunk)

            if expected is not None and written != int(expected):
                raise OSError(f"Expected {expected} bytes, received {written}.")

            partial_path.replace(destination)
            return
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            partial_path.unlink(missing_ok=True)
            if attempt == MAX_ATTEMPTS:
                raise
            wait_seconds = 5 * attempt
            logger.warning(
                "Attempt %d/%d failed (%s). Retrying in %d s.",
                attempt,
                MAX_ATTEMPTS,
                error,
                wait_seconds,
            )
            time.sleep(wait_seconds)


def extract_month(month: str, output_dir: Path, force: bool = False) -> DownloadManifest:
    """Download one month and return its audit manifest."""
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / f"traffic_density_{month}.csv"
    manifest_path = output_dir / f"traffic_density_{month}.manifest.json"

    if not force and is_already_downloaded(csv_path, manifest_path):
        logger.info("%s is already downloaded and verified.", csv_path.name)
        return DownloadManifest(**json.loads(manifest_path.read_text(encoding="utf-8")))

    resource = find_resource(month)
    logger.info("Downloading %s", resource.url)
    started = time.perf_counter()
    download_file(resource.url, csv_path)

    size_bytes = csv_path.stat().st_size
    if resource.catalog_size_bytes and size_bytes != resource.catalog_size_bytes:
        logger.warning(
            "Catalog lists %d bytes but the downloaded file has %d bytes.",
            resource.catalog_size_bytes,
            size_bytes,
        )

    manifest = DownloadManifest(
        month=f"{month[:4]}-{month[4:]}",
        file_name=csv_path.name,
        source_url=resource.url,
        resource_id=resource.resource_id,
        resource_name=resource.name,
        source_last_modified=resource.last_modified,
        catalog_size_bytes=resource.catalog_size_bytes,
        size_bytes=size_bytes,
        sha256=sha256_of(csv_path),
        downloaded_at_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )
    manifest_path.write_text(
        json.dumps(asdict(manifest), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    logger.info(
        "Saved %s (%.1f MB) in %.0f s.",
        csv_path.name,
        size_bytes / 1_000_000,
        time.perf_counter() - started,
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--month", required=True, type=parse_month, help="YYYY-MM")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--force", action="store_true", help="Download again")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    extract_month(args.month, args.output_dir, args.force)


if __name__ == "__main__":
    main()
