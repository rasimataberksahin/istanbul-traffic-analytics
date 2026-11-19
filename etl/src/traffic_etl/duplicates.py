"""Duplicate detection that works across chunks of a large file."""

from __future__ import annotations

import numpy as np
import pandas as pd


class DuplicateTracker:
    """Remember 64-bit hashes of ``(observed_at, geohash)`` keys seen so far."""

    def __init__(self) -> None:
        self._seen = np.array([], dtype=np.uint64)

    def find_duplicates(self, observed_at: pd.Series, geohash: pd.Series) -> np.ndarray:
        """Return a mask of keys already seen. The first occurrence is not marked."""
        keys = pd.DataFrame(
            {
                "observed_at": observed_at.astype("datetime64[ns]").to_numpy(),
                "geohash": geohash.astype(object).to_numpy(),
            }
        )
        hashes = pd.util.hash_pandas_object(keys, index=False).to_numpy()
        is_duplicate = pd.Series(hashes).duplicated().to_numpy() | np.isin(hashes, self._seen)
        self._seen = np.union1d(self._seen, hashes)
        return is_duplicate
