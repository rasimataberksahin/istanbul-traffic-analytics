"""Geohash helpers."""

from __future__ import annotations

from functools import lru_cache
from typing import NamedTuple

GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz"


class GeohashCell(NamedTuple):
    """Center of a geohash cell and half of its height and width in degrees."""

    latitude: float
    longitude: float
    latitude_half: float
    longitude_half: float


@lru_cache(maxsize=100_000)
def decode_geohash(geohash: str) -> GeohashCell | None:
    """Decode a geohash, returning ``None`` when it has an invalid character."""
    if not geohash:
        return None

    lat_low, lat_high = -90.0, 90.0
    lon_low, lon_high = -180.0, 180.0
    is_longitude_bit = True

    for character in geohash:
        value = GEOHASH_ALPHABET.find(character)
        if value < 0:
            return None
        for mask in (16, 8, 4, 2, 1):
            bit_is_set = bool(value & mask)
            if is_longitude_bit:
                middle = (lon_low + lon_high) / 2
                lon_low, lon_high = (middle, lon_high) if bit_is_set else (lon_low, middle)
            else:
                middle = (lat_low + lat_high) / 2
                lat_low, lat_high = (middle, lat_high) if bit_is_set else (lat_low, middle)
            is_longitude_bit = not is_longitude_bit

    return GeohashCell(
        latitude=(lat_low + lat_high) / 2,
        longitude=(lon_low + lon_high) / 2,
        latitude_half=(lat_high - lat_low) / 2,
        longitude_half=(lon_high - lon_low) / 2,
    )
