"""Official public holidays of Turkey, resolved at hour level.

Religious holidays move every year, so only verified years are supported. An
unsupported year raises an error instead of silently producing wrong flags.
"""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import pandas as pd

HALF_DAY_START_HOUR = 13

FIXED_FULL_DAYS = ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"]
FIXED_HALF_DAYS = ["10-28"]

RELIGIOUS_FULL_DAYS = {
    2023: [
        "2023-04-21", "2023-04-22", "2023-04-23",
        "2023-06-28", "2023-06-29", "2023-06-30", "2023-07-01",
    ],
    2024: [
        "2024-04-10", "2024-04-11", "2024-04-12",
        "2024-06-16", "2024-06-17", "2024-06-18", "2024-06-19",
    ],
    2025: [
        "2025-03-30", "2025-03-31", "2025-04-01",
        "2025-06-06", "2025-06-07", "2025-06-08", "2025-06-09",
    ],
}
RELIGIOUS_HALF_DAYS = {
    2023: ["2023-04-20", "2023-06-27"],
    2024: ["2024-04-09", "2024-06-15"],
    2025: ["2025-03-29", "2025-06-05"],
}


def holiday_dates(years: Iterable[int]) -> tuple[pd.DatetimeIndex, pd.DatetimeIndex]:
    """Return the full-day and half-day holiday dates of the given years."""
    full_days: list[str] = []
    half_days: list[str] = []

    for year in sorted(set(years)):
        if year not in RELIGIOUS_FULL_DAYS:
            supported = ", ".join(str(item) for item in sorted(RELIGIOUS_FULL_DAYS))
            raise ValueError(f"Holidays for {year} are not defined. Supported: {supported}.")
        full_days += [f"{year}-{day}" for day in FIXED_FULL_DAYS]
        full_days += RELIGIOUS_FULL_DAYS[year]
        half_days += [f"{year}-{day}" for day in FIXED_HALF_DAYS]
        half_days += RELIGIOUS_HALF_DAYS[year]

    return pd.DatetimeIndex(full_days), pd.DatetimeIndex(half_days)


def public_holiday_mask(timestamps: pd.Series | pd.DatetimeIndex) -> np.ndarray:
    """Flag timestamps that fall inside an official public holiday."""
    index = pd.DatetimeIndex(timestamps)
    if index.empty:
        return np.zeros(0, dtype=bool)

    full_days, half_days = holiday_dates(index.year.unique())
    dates = index.normalize()
    is_full_day = dates.isin(full_days)
    is_half_day = dates.isin(half_days) & (index.hour >= HALF_DAY_START_HOUR)
    return np.asarray(is_full_day | is_half_day)
