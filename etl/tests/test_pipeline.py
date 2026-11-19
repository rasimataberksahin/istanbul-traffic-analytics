from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
import pytest

from conftest import month_rows, raw_row, write_raw_csv
from traffic_etl.config import CLEAN_SCHEMA
from traffic_etl.transform import run_transform
from traffic_etl.validate import DataValidationError, validate_clean_file

MONTH = "2024-10"


def run(workspace: dict[str, Path], chunk_size: int = 500) -> dict:
    return run_transform(
        MONTH,
        raw_dir=workspace["raw"],
        processed_dir=workspace["processed"],
        report_dir=workspace["reports"],
        chunk_size=chunk_size,
    )


def clean_path(workspace: dict[str, Path]) -> Path:
    return workspace["processed"] / "traffic_clean_202410.parquet"


def rejected_path(workspace: dict[str, Path]) -> Path:
    return workspace["processed"] / "traffic_rejected_202410.csv"


def test_pipeline_reconciles_every_raw_row(workspace):
    rows = month_rows()
    rows.append(raw_row(DATE_TIME="2024-10-01 00:00:00"))
    rows.append(raw_row(AVERAGE_SPEED="abc"))
    write_raw_csv(workspace["raw"], rows)

    report = run(workspace)

    assert report["input"]["rows"] == len(rows)
    assert report["output"]["rows"] == len(rows) - 2
    assert report["output"]["quarantined_rows"] == 2
    assert report["reject_reasons"] == {"duplicate_key": 1, "invalid_number": 1}
    assert pq.read_metadata(clean_path(workspace)).num_rows == len(rows) - 2
    assert len(pd.read_csv(rejected_path(workspace))) == 2


def test_output_matches_the_schema(workspace):
    write_raw_csv(workspace["raw"], month_rows())

    run(workspace)

    assert pq.read_schema(clean_path(workspace)).remove_metadata().equals(CLEAN_SCHEMA)


def test_outage_hours_are_flagged_but_not_deleted(workspace):
    write_raw_csv(workspace["raw"], month_rows())

    report = run(workspace)
    frame = pd.read_parquet(clean_path(workspace))
    partial = frame.loc[frame["is_partial_hour"], "observed_at"].astype(str).unique().tolist()

    assert partial == ["2024-10-10 09:00:00", "2024-10-10 10:00:00"]
    assert [item["observed_at"] for item in report["partial_hours"]] == partial
    assert not frame.loc[frame["is_partial_hour"], "is_analysis_eligible"].any()
    assert frame.loc[~frame["is_partial_hour"], "is_analysis_eligible"].all()


def test_result_does_not_depend_on_chunk_size(workspace):
    write_raw_csv(workspace["raw"], month_rows())

    run(workspace, chunk_size=97)
    small_chunks = pd.read_parquet(clean_path(workspace))
    run(workspace, chunk_size=5_000)
    large_chunks = pd.read_parquet(clean_path(workspace))

    pd.testing.assert_frame_equal(small_chunks, large_chunks)


def test_rerun_produces_identical_output(workspace):
    write_raw_csv(workspace["raw"], month_rows())

    first = run(workspace)
    second = run(workspace)

    assert first["output"]["sha256"] == second["output"]["sha256"]


def test_no_temporary_files_remain(workspace):
    write_raw_csv(workspace["raw"], month_rows())

    run(workspace)

    assert sorted(path.name for path in workspace["processed"].iterdir()) == [
        "traffic_clean_202410.parquet",
        "traffic_rejected_202410.csv",
    ]


def test_too_many_rejected_rows_stop_the_run(workspace):
    write_raw_csv(workspace["raw"], [raw_row(), raw_row(AVERAGE_SPEED="abc")])

    with pytest.raises(DataValidationError, match="rejected"):
        run(workspace)

    assert not clean_path(workspace).exists()


def test_failed_validation_keeps_the_previous_output(workspace, monkeypatch):
    write_raw_csv(workspace["raw"], month_rows())
    run(workspace)
    previous = clean_path(workspace).read_bytes()

    def fail(*args, **kwargs):
        raise DataValidationError("contract broken")

    monkeypatch.setattr("traffic_etl.transform.validate_clean_file", fail)

    with pytest.raises(DataValidationError, match="contract broken"):
        run(workspace)

    assert clean_path(workspace).read_bytes() == previous
    assert len(list(workspace["processed"].iterdir())) == 2


def test_unexpected_header_stops_the_run(workspace):
    path = workspace["raw"] / "traffic_density_202410.csv"
    path.write_text("DATE_TIME,SPEED\n2024-10-01 00:00:00,10\n", encoding="utf-8")

    with pytest.raises(DataValidationError, match="Unexpected raw columns"):
        run(workspace)


def test_changed_raw_file_stops_the_run(workspace):
    path = write_raw_csv(workspace["raw"], month_rows())
    manifest = path.with_suffix(".manifest.json")
    manifest.write_text(json.dumps({"sha256": "different"}), encoding="utf-8")

    with pytest.raises(DataValidationError, match="manifest"):
        run(workspace)


def test_validator_detects_a_row_count_gap(workspace):
    write_raw_csv(workspace["raw"], month_rows())
    report = run(workspace)

    with pytest.raises(DataValidationError, match="row_count_reconciled"):
        validate_clean_file(
            clean_path(workspace),
            MONTH,
            expected_rows=report["output"]["rows"] + 1,
            expected_vehicles=report["validation"]["vehicle_total"],
            partial_hours=pd.to_datetime(
                [item["observed_at"] for item in report["partial_hours"]]
            ),
        )


def test_validator_detects_a_wrong_partial_hour_flag(workspace):
    write_raw_csv(workspace["raw"], month_rows())
    report = run(workspace)

    with pytest.raises(DataValidationError, match="flag_is_partial_hour"):
        validate_clean_file(
            clean_path(workspace),
            MONTH,
            expected_rows=report["output"]["rows"],
            expected_vehicles=report["validation"]["vehicle_total"],
            partial_hours=[],
        )
