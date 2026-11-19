import pytest

from traffic_etl.run import month_range


def test_month_range_crosses_the_year():
    assert month_range("2023-11", "2024-02") == ["2023-11", "2023-12", "2024-01", "2024-02"]


def test_single_month_range():
    assert month_range("2024-10", "2024-10") == ["2024-10"]


@pytest.mark.parametrize(("first", "last"), [("2024-13", "2024-12"), ("2024-1", "2024-02"), ("2024-05", "2024-04")])
def test_invalid_ranges_fail(first, last):
    with pytest.raises(ValueError):
        month_range(first, last)
