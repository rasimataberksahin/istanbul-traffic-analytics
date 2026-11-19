from __future__ import annotations

from datetime import date, datetime

from traffic_etl.weather import POINTS, build_url, chunks, combine


def location(times, temperature, precipitation, snowfall, code):
    return {
        "hourly": {
            "time": times,
            "temperature_2m": temperature,
            "precipitation": precipitation,
            "snowfall": snowfall,
            "weather_code": code,
        }
    }


def test_points_are_averaged_and_moved_to_the_hour_they_describe():
    times = ["2024-10-02T18:00", "2024-10-02T19:00"]
    hours = combine(
        [
            location(times, [20.0, 19.0], [0.0, 3.0], [0.0, 0.0], [0, 63]),
            location(times, [22.0, 21.0], [0.0, 1.5], [0.0, 0.0], [1, 61]),
            location(times, [24.0, 23.0], [0.0, 0.0], [0.0, 0.0], [2, 3]),
        ]
    )

    assert [hour.observed_at for hour in hours] == [datetime(2024, 10, 2, 17), datetime(2024, 10, 2, 18)]
    rainy = hours[1]
    assert rainy.temperature_c == 21.0
    assert rainy.precipitation_mm == 1.5
    assert rainy.weather_code == 63


def test_hours_with_a_missing_point_are_skipped():
    times = ["2024-10-02T18:00", "2024-10-02T19:00"]
    hours = combine(
        [
            location(times, [20.0, 19.0], [0.0, None], [0.0, 0.0], [0, 0]),
            location(times, [22.0, 21.0], [0.0, 0.0], [0.0, 0.0], [0, 0]),
        ]
    )
    assert len(hours) == 1


def test_requests_cover_all_points_in_istanbul_time():
    url = build_url(date(2024, 1, 1), date(2024, 1, 31))
    assert "timezone=Europe%2FIstanbul" in url
    assert url.count("%2C") >= 2 * (len(POINTS) - 1)
    assert "hourly=temperature_2m%2Cprecipitation%2Csnowfall%2Cweather_code" in url


def test_long_ranges_are_split_into_year_chunks():
    parts = list(chunks(date(2023, 1, 1), date(2025, 1, 31)))
    assert parts[0] == (date(2023, 1, 1), date(2024, 1, 1))
    assert parts[-1][1] == date(2025, 1, 31)
    assert all(start <= end for start, end in parts)
