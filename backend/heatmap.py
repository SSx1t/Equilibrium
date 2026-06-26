"""
Step 3 - sub-district "service pressure" heatmap.

APPROACH (stated explicitly per the brief): a regular GRID over the city
bounding box. This is NOT the district choropleth re-plotted as points - it is a
genuinely finer, sub-district view built from POINT data:

  - DEMAND proxy  = density of geocoded listings (sample_listings.csv lat/lon,
                    6,000 points) -> where people want to live / market pressure.
  - SUPPLY proxy  = density of mapped service amenities (osm_amenities.csv lat/lon
                    in the 5 buckets) -> where services already exist.

Both grids are box-blurred (SMOOTHING_RADIUS_CELLS) for a smooth surface, each
normalised 0-1, and pressure = clip(demand_norm - supply_norm, 0, 1). High weight
= many residents/listings with few nearby services (under-served hotspot).

Grid cell size and smoothing radius are assumptions in config.py.
"""
from __future__ import annotations

import numpy as np

from . import config
from .data_loader import get_store, _bucket_for


def _box_blur(grid: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return grid
    out = np.zeros_like(grid, dtype=float)
    n = 0
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            out += np.roll(np.roll(grid, dy, axis=0), dx, axis=1)
            n += 1
    return out / n


def _normalise(grid: np.ndarray) -> np.ndarray:
    mx = grid.max()
    return grid / mx if mx > 0 else grid


def _apply_supply_overrides(
    lats: np.ndarray,
    lons: np.ndarray,
    extra_supply: list[tuple[float, float]] | None,
    removed_supply: list[tuple[float, float]] | None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Add user-placed amenity points (with extra local weight) to the supply
    set, and drop the nearest existing supply point for each removed amenity
    (within ~1.5 km). Returns (lats, lons, weights)."""
    lats = lats.copy()
    lons = lons.copy()
    weights = np.ones(len(lats))
    if removed_supply:
        for rlat, rlon in removed_supply:
            if len(lats) == 0:
                break
            d2 = (lats - rlat) ** 2 + (lons - rlon) ** 2
            j = int(np.argmin(d2))
            if d2[j] <= 0.0135**2:  # ~1.5 km
                lats = np.delete(lats, j)
                lons = np.delete(lons, j)
                weights = np.delete(weights, j)
    if extra_supply:
        add_lat = np.array([p[0] for p in extra_supply])
        add_lon = np.array([p[1] for p in extra_supply])
        add_w = np.full(len(extra_supply), config.OVERRIDE_SUPPLY_WEIGHT)
        lats = np.concatenate([lats, add_lat])
        lons = np.concatenate([lons, add_lon])
        weights = np.concatenate([weights, add_w])
    return lats, lons, weights


def compute_heatmap_points(
    extra_supply: list[tuple[float, float]] | None = None,
    removed_supply: list[tuple[float, float]] | None = None,
) -> list[dict]:
    """Return a list of {lat, lon, weight} sub-district pressure points.

    extra_supply / removed_supply let user-placed (hypothetical) amenities
    relieve or add local service pressure at their real coordinates, giving a
    sub-district view (e.g. a clinic dropped in a specific part of Mussafah)."""
    store = get_store()

    am = store.amenities
    listings = store.listings

    # bounding box from amenity extent (amenities cover the whole city)
    pad = config.HEATMAP_BBOX_PAD_DEG
    lat_min = float(am["latitude"].min()) - pad
    lat_max = float(am["latitude"].max()) + pad
    lon_min = float(am["longitude"].min()) - pad
    lon_max = float(am["longitude"].max()) + pad

    cell = config.GRID_CELL_DEG
    n_lat = max(1, int(np.ceil((lat_max - lat_min) / cell)))
    n_lon = max(1, int(np.ceil((lon_max - lon_min) / cell)))

    lat_edges = lat_min + np.arange(n_lat + 1) * cell
    lon_edges = lon_min + np.arange(n_lon + 1) * cell

    # --- DEMAND grid: listing point density ---
    demand_grid, _, _ = np.histogram2d(
        listings["latitude"].to_numpy(),
        listings["longitude"].to_numpy(),
        bins=[lat_edges, lon_edges],
    )

    # --- SUPPLY grid: mapped-amenity point density (5 buckets only) ---
    buckets = np.array([_bucket_for(c, s) for c, s in zip(am["category"], am["subtype"])])
    mask = buckets != None  # noqa: E711  (object array, need != None not "is not")
    sup_lat = am["latitude"].to_numpy()[mask]
    sup_lon = am["longitude"].to_numpy()[mask]
    sup_lat, sup_lon, sup_w = _apply_supply_overrides(
        sup_lat, sup_lon, extra_supply, removed_supply
    )
    supply_grid, _, _ = np.histogram2d(
        sup_lat,
        sup_lon,
        bins=[lat_edges, lon_edges],
        weights=sup_w,
    )

    r = config.SMOOTHING_RADIUS_CELLS
    demand_n = _normalise(_box_blur(demand_grid, r))
    supply_n = _normalise(_box_blur(supply_grid, r))

    pressure = np.clip(demand_n - supply_n, 0.0, 1.0)

    lat_centers = lat_min + (np.arange(n_lat) + 0.5) * cell
    lon_centers = lon_min + (np.arange(n_lon) + 0.5) * cell

    points: list[dict] = []
    min_w = config.HEATMAP_MIN_WEIGHT
    for i in range(n_lat):
        for j in range(n_lon):
            w = float(pressure[i, j])
            if w >= min_w:
                points.append(
                    {
                        "lat": round(float(lat_centers[i]), 5),
                        "lon": round(float(lon_centers[j]), 5),
                        "weight": round(w, 4),
                    }
                )
    return points


def heatmap_meta() -> dict:
    return {
        "approach": "regular_grid",
        "resolution": "sub-district",
        "grid_cell_deg": config.GRID_CELL_DEG,
        "grid_cell_approx_km": round(config.GRID_CELL_DEG * 111.0, 2),
        "smoothing_radius_cells": config.SMOOTHING_RADIUS_CELLS,
        "demand_proxy": "sample_listings.csv geocoded listing density",
        "supply_proxy": "osm_amenities.csv mapped-amenity density (5 buckets)",
        "weight_meaning": "clip(demand_norm - supply_norm, 0, 1): higher = more under-served",
    }
