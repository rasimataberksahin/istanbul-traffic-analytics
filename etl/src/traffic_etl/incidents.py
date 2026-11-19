"""Traffic incidents of the IBB Traffic Management Centre: extract, clean and load.

    python -m traffic_etl.incidents              # download if changed, transform, load
    python -m traffic_etl.incidents --force      # rebuild and reload even if unchanged

The source is one CSV with every announcement since 2013 (accidents, breakdowns,
road works, closures...), republished monthly with the new rows appended. Each run:

1. **Extract**: resolves the current file from the CKAN catalog and downloads it to
   ``data/raw`` with a SHA-256 manifest. An unchanged file is not downloaded again.
2. **Transform**: parses both timestamp formats, maps 20 raw types to 9 categories,
   reads accident severity, road, segment, lane and landmark from the free-text
   title, assigns each incident to a geohash cell and its neighbourhood, flags
   implausible durations and quarantines rows that cannot be used. Writes a Parquet
   snapshot, a quarantine CSV and a JSON run report.
3. **Load**: replaces ``traffic.fact_incident`` in one transaction (the file is a
   full history), records the load and refreshes the traffic impact table that
   joins incidents with the hourly traffic of the same cell.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import math
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg

from traffic_etl.config import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN, PROCESSED_DIR, PROJECT_ROOT, RAW_DIR, REPORT_DIR
from traffic_etl.extract import download_file, open_url, sha256_of
from traffic_etl.geo import decode_geohash, encode_geohash

logger = logging.getLogger("traffic_etl.incidents")

CATALOG_URL = (
    "https://data.ibb.gov.tr/api/3/action/package_show"
    "?id=ulasim-yonetim-merkezi-trafik-duyurulari-verisi"
)
RAW_PREFIX = "traffic_announcements"
NAMES_PATH = PROJECT_ROOT / "database" / "reference" / "location_names.csv"

# A cell without a name of its own takes the name of the nearest named cell within this distance.
NEAREST_NAME_KM = 1.5
# Durations outside this range are kept but not used: the record was left open or closed early.
MIN_DURATION_MINUTES = 1
MAX_DURATION_MINUTES = 7 * 24 * 60
MAX_RESPONSE_MINUTES = 24 * 60

CATEGORIES: dict[str, str] = {
    "Kaza Bildirimi": "accident",
    "Araç Arızası": "breakdown",
    "Araç Yangını": "vehicle_fire",
    "Bakım-Onarım Çalışması": "roadworks",
    "Yol Yapım Çalışması": "roadworks",
    "Alt Yapı Çalışması": "roadworks",
    "Çevre Düzenlemesi": "roadworks",
    "İmalat Çalışması": "roadworks",
    "Yolun Trafiğe Kapanması": "closure",
    "Kontrollü Kapama (Protokol)": "closure",
    "Yoğun Trafik": "congestion",
    "Etkinlik (Geçit, koşu, miting vb.)": "event",
    "Yolu Etkileyen Hava Koşulu": "weather",
}
OTHER_CATEGORY = "other"

SEVERITY_FROM_TYPE = {
    "trafik kazası (hasarlı)": "damage",
    "trafik kazası (yaralanmalı)": "injury",
    "trafik kazası (zincirleme)": "chain",
    "trafik kazası (can kaybı)": "fatal",
}
# Older records leave the accident type empty; the title still says it.
SEVERITY_FROM_TITLE = [
    ("fatal", re.compile(r"can kayb|ölümlü")),
    ("injury", re.compile(r"yaralanmal")),
    ("chain", re.compile(r"zincirleme")),
    ("damage", re.compile(r"hasarl")),
]

# Ordered: the first pattern that matches the start of the title names the road.
ROADS = [
    ("D100", re.compile(r"^(d\s?-?\s?100|e\s?-?\s?5)\b")),
    ("TEM", re.compile(r"^tem\b")),
    ("O-3", re.compile(r"^o\s?-?\s?3\b")),
    ("Kuzey Marmara Otoyolu", re.compile(r"^(kco|kmo|kuzey marmara|kuzey çevre)")),
    ("Basın Ekspres Yolu", re.compile(r"^basın ekspres")),
    ("Sahil Yolu", re.compile(r"^(sahil|s\.\s?yolu)")),
    ("Büyükdere Caddesi", re.compile(r"^büyükdere")),
    ("Avrasya Tüneli", re.compile(r"^avrasya")),
    ("Şile Yolu", re.compile(r"^şile")),
    ("Bağlantı Yolu", re.compile(r"^bağlantı")),
    ("Vatan Caddesi", re.compile(r"^vatan")),
    ("Barbaros Bulvarı", re.compile(r"^barbaros")),
    ("Kennedy Caddesi", re.compile(r"^kennedy")),
]
SEGMENT = re.compile(r"^[\s,]*(?P<from>[^-–,]+?)\s*[-–]\s*(?P<to>[^,]+?)\s+(?:yönü|istikameti)", re.IGNORECASE)
# A named lane wins over a closure phrase: "sağ şerit trafiğe kapalı" closes the right lane only.
LANES = [
    ("shoulder", re.compile(r"emniyet şerid")),
    ("left", re.compile(r"sol şerit")),
    ("middle", re.compile(r"orta şerit")),
    ("right", re.compile(r"sağ şerit")),
    ("all", re.compile(r"tüm şerit|bütün şerit|yol trafiğe kapa|trafiğe kapatıl")),
]
SIDE_ROAD = re.compile(r"yan\s?yol")
LANDMARKS = [
    ("15 Temmuz Şehitler Köprüsü", re.compile(r"15 temmuz|boğaziçi köpr")),
    ("Fatih Sultan Mehmet Köprüsü", re.compile(r"fsm|fatih sultan mehmet")),
    ("Yavuz Sultan Selim Köprüsü", re.compile(r"yavuz sultan|yssk")),
    ("Avrasya Tüneli", re.compile(r"avrasya")),
    ("Haliç Köprüsü", re.compile(r"haliç köpr")),
]


def tr_lower(text: str) -> str:
    """Lowercase with Turkish dotted and dotless i."""
    return text.replace("I", "ı").replace("İ", "i").lower()


def clean_title(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def parse_severity(accident_type: str, title: str) -> str:
    known = SEVERITY_FROM_TYPE.get(tr_lower(accident_type.strip()))
    if known:
        return known
    lowered = tr_lower(title)
    for severity, pattern in SEVERITY_FROM_TITLE:
        if pattern.search(lowered):
            return severity
    return "unknown"


def match_road(title: str) -> tuple[str | None, int]:
    """The road a title starts with and where its name ends in the title."""
    lowered = tr_lower(title)
    for name, pattern in ROADS:
        found = pattern.search(lowered)
        if found:
            # Skip the rest of a multi-word name such as "Sahil Yolu" or "Basın Ekspres Yolu".
            end = found.end()
            rest = re.match(r"\S*(?:\s+(?:yolu|caddesi|cad\.|bulvarı|tüneli|otoyolu))?", lowered[end:])
            return name, end + (rest.end() if rest else 0)
    return None, 0


def parse_road(title: str) -> str | None:
    return match_road(title)[0]


def parse_segment(title: str) -> str | None:
    """'D100 Acıbadem-Altunizade Yönü, sol şerit...' -> 'Acıbadem - Altunizade'."""
    _, end = match_road(title)
    match = SEGMENT.search(title[end:])
    if not match:
        return None
    start = re.sub(r"\(.*?\)", "", match.group("from")).strip(" ,.")
    end = re.sub(r"\(.*?\)", "", match.group("to")).strip(" ,.")
    if not start or not end or len(start) > 40 or len(end) > 40:
        return None
    return f"{start} - {end}"


def parse_first(patterns: list[tuple[str, re.Pattern]], title: str) -> str | None:
    lowered = tr_lower(title)
    for name, pattern in patterns:
        if pattern.search(lowered):
            return name
    return None


def parse_closed_lanes(value: str) -> int | None:
    """The source uses 1..5 for closed lanes; 0, -1 and blanks carry no count."""
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return None
    return number if 1 <= number <= 5 else None


def parse_timestamps(values: pd.Series) -> pd.Series:
    """Both source formats, with and without milliseconds, as whole seconds."""
    return pd.to_datetime(values.replace("", None), format="mixed", errors="coerce").dt.floor("s")


@dataclass(frozen=True)
class NamedCells:
    geohashes: np.ndarray
    latitudes: np.ndarray
    longitudes: np.ndarray
    neighborhoods: np.ndarray
    districts: np.ndarray


def read_named_cells(path: Path = NAMES_PATH) -> NamedCells:
    rows = []
    with path.open(encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            cell = decode_geohash(row["geohash"])
            if cell and row["district"]:
                rows.append((row["geohash"], cell.latitude, cell.longitude, row["neighborhood"] or None, row["district"]))
    frame = pd.DataFrame(rows, columns=["geohash", "lat", "lon", "neighborhood", "district"])
    return NamedCells(
        frame.geohash.to_numpy(),
        frame.lat.to_numpy(),
        frame.lon.to_numpy(),
        frame.neighborhood.to_numpy(dtype=object),
        frame.district.to_numpy(dtype=object),
    )


def nearest_names(latitudes: np.ndarray, longitudes: np.ndarray, cells: NamedCells, chunk: int = 20_000):
    """Neighbourhood and district of the nearest named cell centre within NEAREST_NAME_KM.

    On a regular grid the nearest centre is the cell that contains the point, so cells
    with their own name keep it and the rest borrow from a neighbour.
    """
    count = len(latitudes)
    neighborhoods = np.full(count, None, dtype=object)
    districts = np.full(count, None, dtype=object)
    distances = np.full(count, np.inf)
    if count == 0 or len(cells.geohashes) == 0:
        return neighborhoods, districts, distances
    scale = math.cos(math.radians(41.0))
    for start in range(0, count, chunk):
        lat = latitudes[start : start + chunk, None]
        lon = longitudes[start : start + chunk, None]
        dy = (lat - cells.latitudes[None, :]) * 111.32
        dx = (lon - cells.longitudes[None, :]) * 111.32 * scale
        squared = dx * dx + dy * dy
        best = squared.argmin(axis=1)
        best_distance = np.sqrt(squared[np.arange(len(best)), best])
        near = best_distance <= NEAREST_NAME_KM
        index = np.arange(start, start + len(best))
        neighborhoods[index[near]] = cells.neighborhoods[best[near]]
        districts[index[near]] = cells.districts[best[near]]
        distances[index] = best_distance
    return neighborhoods, districts, distances


def transform(raw: pd.DataFrame, cells: NamedCells | None = None) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Clean incidents, the quarantined rows with their reasons, and counts for the run report."""
    frame = raw.copy()
    reasons = pd.Series("", index=frame.index)

    incident_id = pd.to_numeric(frame["announcement_id"], errors="coerce")
    started = parse_timestamps(frame["announcement_starting_datetime"])
    latitude = pd.to_numeric(frame["latitude"], errors="coerce")
    longitude = pd.to_numeric(frame["longitude"], errors="coerce")

    reasons[incident_id.isna()] = "invalid_id"
    reasons[(reasons == "") & started.isna()] = "invalid_start"
    outside = ~latitude.between(LAT_MIN, LAT_MAX) | ~longitude.between(LON_MIN, LON_MAX)
    reasons[(reasons == "") & outside] = "outside_istanbul"
    reasons[(reasons == "") & incident_id.duplicated(keep="first")] = "duplicate_id"

    rejected = raw[reasons != ""].assign(reject_reason=reasons[reasons != ""])
    keep = reasons == ""
    frame = frame[keep]
    started = started[keep]
    ended = parse_timestamps(frame["announcement_ending_datetime"])
    intervened = parse_timestamps(frame["intervention_datetime"])

    duration = (ended - started).dt.total_seconds() / 60
    response = (intervened - started).dt.total_seconds() / 60
    duration_invalid = duration.isna() | (duration < MIN_DURATION_MINUTES) | (duration > MAX_DURATION_MINUTES)
    # Most records copy the closing time into the intervention field, which says nothing about the
    # response. Only an intervention logged before the closure is a real arrival time.
    response_recorded = intervened.notna() & ended.notna() & (intervened < ended)
    response_invalid = ~response_recorded | response.isna() | (response < 0) | (response > MAX_RESPONSE_MINUTES)

    titles = frame["announcement_title"].map(clean_title)
    raw_types = frame["announcement_type_desc"].str.strip()
    category = raw_types.map(CATEGORIES).fillna(OTHER_CATEGORY)
    accident_types = frame["accident_type"].fillna("")
    severity = pd.Series(
        [parse_severity(kind, title) if cat == "accident" else None for kind, title, cat in zip(accident_types, titles, category)],
        index=frame.index,
        dtype=object,
    )

    lat = latitude[keep].to_numpy()
    lon = longitude[keep].to_numpy()
    geohashes = [encode_geohash(a, b) for a, b in zip(lat, lon)]
    cells = cells or read_named_cells()
    neighborhoods, districts, _ = nearest_names(lat, lon, cells)

    clean = pd.DataFrame(
        {
            "incident_id": incident_id[keep].astype("int64").to_numpy(),
            "started_at": started.to_numpy(),
            "ended_at": ended.to_numpy(),
            "intervened_at": intervened.to_numpy(),
            "duration_min": duration.where(~duration_invalid).round(1).to_numpy(),
            "response_min": response.where(~response_invalid).round(1).to_numpy(),
            "category": category.to_numpy(),
            "source_type": raw_types.to_numpy(),
            "severity": severity.to_numpy(),
            "title": titles.to_numpy(),
            "road": titles.map(parse_road).to_numpy(),
            "segment": titles.map(parse_segment).to_numpy(),
            "lane": titles.map(lambda title: parse_first(LANES, title)).to_numpy(),
            "is_side_road": titles.map(lambda title: bool(SIDE_ROAD.search(tr_lower(title)))).to_numpy(),
            "landmark": titles.map(lambda title: parse_first(LANDMARKS, title)).to_numpy(),
            "closed_lanes": frame["closed_lane"].map(parse_closed_lanes).astype("Int64").to_numpy(),
            "latitude": lat.round(6),
            "longitude": lon.round(6),
            "geohash": geohashes,
            "neighborhood": neighborhoods,
            "district": districts,
            "is_duration_invalid": duration_invalid.to_numpy(),
        }
    ).sort_values("started_at", kind="stable")

    report = {
        "rows": {
            "raw": int(len(raw)),
            "clean": int(len(clean)),
            "quarantined": int(len(rejected)),
            "raw_equals_clean_plus_quarantined": int(len(raw)) == int(len(clean)) + int(len(rejected)),
        },
        "reject_reasons": {key: int(value) for key, value in rejected["reject_reason"].value_counts().items()},
        "period": {"first": str(clean["started_at"].min()), "last": str(clean["started_at"].max())},
        "categories": {key: int(value) for key, value in clean["category"].value_counts().items()},
        "accident_severity": {key: int(value) for key, value in clean["severity"].dropna().value_counts().items()},
        "parsed_share": {
            "road": round(float(clean["road"].notna().mean()), 4),
            "segment": round(float(clean["segment"].notna().mean()), 4),
            "lane": round(float(clean["lane"].notna().mean()), 4),
            "district": round(float(clean["district"].notna().mean()), 4),
            "closed_lanes": round(float(clean["closed_lanes"].notna().mean()), 4),
        },
        "flags": {
            "invalid_duration": int(duration_invalid.sum()),
            "invalid_response": int(response_invalid.sum()),
            "response_recorded": int(response_recorded.sum()),
        },
        "thresholds": {
            "min_duration_minutes": MIN_DURATION_MINUTES,
            "max_duration_minutes": MAX_DURATION_MINUTES,
            "max_response_minutes": MAX_RESPONSE_MINUTES,
            "nearest_name_km": NEAREST_NAME_KM,
        },
    }
    return clean, rejected, report


# --- Extract -----------------------------------------------------------------


@dataclass(frozen=True)
class IncidentSource:
    url: str
    last_modified: str
    size_bytes: int | None

    @property
    def stamp(self) -> str:
        return self.last_modified[:10].replace("-", "")


def find_source() -> IncidentSource:
    with open_url(CATALOG_URL) as response:
        package = json.load(response)["result"]
    resources = [item for item in package["resources"] if (item.get("format") or "").upper() == "CSV"]
    if not resources:
        raise RuntimeError("The incident data set has no CSV resource.")
    latest = max(resources, key=lambda item: item.get("last_modified") or item.get("created") or "")
    size = latest.get("size")
    return IncidentSource(latest["url"], latest.get("last_modified") or latest.get("created") or "", int(size) if size else None)


def extract(raw_dir: Path = RAW_DIR, force: bool = False) -> Path:
    source = find_source()
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / f"{RAW_PREFIX}_{source.stamp}.csv"
    manifest = path.with_suffix(".manifest.json")
    if path.exists() and manifest.exists() and not force:
        recorded = json.loads(manifest.read_text(encoding="utf-8"))
        if recorded.get("sha256") == sha256_of(path) and recorded.get("source_url") == source.url:
            logger.info("%s is already downloaded.", path.name)
            return path

    started = time.perf_counter()
    download_file(source.url, path)
    manifest.write_text(
        json.dumps(
            {
                "source_url": source.url,
                "source_last_modified": source.last_modified,
                "file": path.name,
                "size_bytes": path.stat().st_size,
                "sha256": sha256_of(path),
                "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    logger.info("Downloaded %s in %.0f s.", path.name, time.perf_counter() - started)
    return path


def read_raw(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, encoding="utf-8-sig", dtype=str, keep_default_na=False)


def run_transform(raw_path: Path, processed_dir: Path = PROCESSED_DIR, report_dir: Path = REPORT_DIR) -> Path:
    raw = read_raw(raw_path)
    clean, rejected, report = transform(raw)
    stamp = raw_path.stem.rsplit("_", 1)[-1]
    processed_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    parquet = processed_dir / f"incidents_{stamp}.parquet"
    clean.to_parquet(parquet, index=False)
    quarantine = processed_dir / f"incidents_rejected_{stamp}.csv"
    rejected.to_csv(quarantine, index=False, encoding="utf-8")

    report = {
        "input": {"file": raw_path.name, "sha256": sha256_of(raw_path), "size_bytes": raw_path.stat().st_size},
        "output": {"file": parquet.name, "sha256": sha256_of(parquet), "quarantine_file": quarantine.name},
        **report,
    }
    (report_dir / f"incidents_{stamp}.report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Transformed %s: %s", raw_path.name, report["rows"])
    return parquet


# --- Load --------------------------------------------------------------------

STAGE_DDL = """
CREATE TEMP TABLE stage_incident (LIKE traffic.fact_incident INCLUDING DEFAULTS) ON COMMIT DROP;
ALTER TABLE stage_incident DROP COLUMN location_id, DROP COLUMN date_key, DROP COLUMN hour_of_day,
    DROP COLUMN is_weekend, DROP COLUMN iso_day_of_week;
"""
LOAD_COLUMNS = [
    "incident_id", "started_at", "ended_at", "intervened_at", "duration_min", "response_min", "category",
    "source_type", "severity", "title", "road", "segment", "lane", "is_side_road", "landmark", "closed_lanes",
    "latitude", "longitude", "geohash", "neighborhood", "district", "is_duration_invalid",
]


def _value(item):
    if item is None:
        return None
    if isinstance(item, float) and math.isnan(item):
        return None
    if item is pd.NaT or (isinstance(item, pd.Timestamp) and pd.isna(item)):
        return None
    if item is pd.NA:
        return None
    if isinstance(item, np.generic):
        return item.item()
    if isinstance(item, pd.Timestamp):
        return item.to_pydatetime()
    return item


def load(parquet: Path, database_url: str, force: bool = False) -> str:
    from traffic_etl.load import apply_schema

    checksum = sha256_of(parquet)
    frame = pd.read_parquet(parquet)
    # Lane counts come back as floats when the column has gaps; COPY needs whole numbers.
    frame["closed_lanes"] = frame["closed_lanes"].astype("Int64")
    with psycopg.connect(database_url) as connection:
        apply_schema(connection)
        audit = connection.execute("SELECT source_sha256 FROM traffic.incident_load_audit ORDER BY loaded_at DESC LIMIT 1").fetchone()
        if audit and audit[0] == checksum and not force:
            logger.info("%s is already loaded.", parquet.name)
            return "skipped"

        connection.execute(STAGE_DDL)
        with connection.cursor() as cursor:
            columns = ", ".join(LOAD_COLUMNS)
            with cursor.copy(f"COPY stage_incident ({columns}) FROM STDIN") as copy:
                for row in frame[LOAD_COLUMNS].itertuples(index=False, name=None):
                    copy.write_row([_value(item) for item in row])
        connection.execute("TRUNCATE traffic.fact_incident, traffic.incident_traffic_impact")
        connection.execute(
            f"""
            INSERT INTO traffic.fact_incident ({columns}, location_id)
            SELECT {", ".join("s." + column for column in LOAD_COLUMNS)}, l.location_id
            FROM stage_incident AS s
            LEFT JOIN traffic.dim_location AS l ON l.geohash = s.geohash
            """
        )
        rows = connection.execute("SELECT COUNT(*) FROM traffic.fact_incident").fetchone()[0]
        if rows != len(frame):
            raise RuntimeError(f"Loaded {rows} incidents, expected {len(frame)}.")
        connection.execute("SELECT traffic.refresh_incident_impact()")
        connection.execute(
            """
            INSERT INTO traffic.incident_load_audit (source_file, source_sha256, row_count, first_started_at, last_started_at)
            SELECT %s, %s, COUNT(*), MIN(started_at), MAX(started_at) FROM traffic.fact_incident
            """,
            (parquet.name, checksum),
        )
        connection.execute("ANALYZE traffic.fact_incident")
    logger.info("Loaded %d incidents from %s.", len(frame), parquet.name)
    return "loaded"


def incident_span(database_url: str) -> tuple[date, date] | None:
    with psycopg.connect(database_url) as connection:
        row = connection.execute("SELECT MIN(started_at)::date, MAX(started_at)::date FROM traffic.fact_incident").fetchone()
    return (row[0], row[1]) if row and row[0] else None


def run_pipeline(database_url: str, force: bool = False, skip_weather: bool = False) -> str:
    """Extract, transform and load the incident history, then fill the weather of its period."""
    from traffic_etl.weather import load_weather

    raw_path = extract(force=force)
    stamp = raw_path.stem.rsplit("_", 1)[-1]
    parquet = PROCESSED_DIR / f"incidents_{stamp}.parquet"
    if force or not parquet.exists():
        parquet = run_transform(raw_path)
    status = load(parquet, database_url, force=force)

    span = incident_span(database_url)
    if span and not skip_weather:
        try:
            load_weather(database_url, span[0], span[1])
        except OSError as error:
            # Weather enriches the analysis; the incidents are loaded either way.
            logger.warning("Weather could not be loaded (%s).", error)
    return status


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--force", action="store_true", help="Download, rebuild and reload even if unchanged")
    parser.add_argument("--skip-weather", action="store_true", help="Do not fetch the weather of the incident period")
    arguments = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    from traffic_etl.load import get_database_url

    run_pipeline(get_database_url(), force=arguments.force, skip_weather=arguments.skip_weather)


if __name__ == "__main__":
    main()
