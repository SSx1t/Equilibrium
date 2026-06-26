"""
Loads the 7 CSVs once and precomputes the per-district baseline tables that the
scoring engine needs. Reference statistics (e.g. max population, max transaction
count) are frozen here at load time so that compute_gap_score stays stable and
comparable across districts even when a single district's population_multiplier
or amenity_overrides are applied live.
"""
from __future__ import annotations

import functools
import pandas as pd

from . import config


def _bucket_for(category: str, subtype: str) -> str | None:
    if category in config.CATEGORY_TO_BUCKET:
        return config.CATEGORY_TO_BUCKET[category]
    if category == "mobility" and subtype in config.TRANSIT_SUBTYPES:
        return "transit"
    if category == "community" and subtype in config.PARK_SUBTYPES:
        return "parks"
    return None


class DataStore:
    """Immutable-ish container for the loaded data and precomputed baselines."""

    def __init__(self) -> None:
        self.districts = pd.read_csv(config.CSV["districts"])
        self.amenities = pd.read_csv(config.CSV["amenities"])
        self.communities = pd.read_csv(config.CSV["communities"])
        self.listings = pd.read_csv(config.CSV["listings"])
        self.investors = pd.read_csv(config.CSV["investors"])
        self.transactions = pd.read_csv(config.CSV["transactions"])
        self.parcels = pd.read_csv(config.CSV["parcels"])

        self.district_names = list(self.districts["district"])

        # --- per-district population & demand drivers (from communities) ---
        com = self.communities
        self.pop_by_district = com.groupby("district")["population_estimate"].sum()
        self.sdi_by_district = com.groupby("district")["service_demand_index"].mean()
        self.occ_by_district = com.groupby("district")["occupancy_rate"].mean()

        # --- transaction activity per district ---
        self.txn_count_by_district = self.transactions.groupby("district").size()

        # --- baseline amenity counts per district per bucket ---
        am = self.amenities.copy()
        am["bucket"] = [
            _bucket_for(c, s) for c, s in zip(am["category"], am["subtype"])
        ]
        mapped = am.dropna(subset=["bucket"])
        self.baseline_bucket_counts = (
            mapped.groupby(["district", "bucket"]).size().unstack(fill_value=0)
        )
        # ensure all 5 buckets exist as columns
        for b in config.SUPPLY_BUCKETS:
            if b not in self.baseline_bucket_counts.columns:
                self.baseline_bucket_counts[b] = 0
        self.baseline_bucket_counts = self.baseline_bucket_counts[config.SUPPLY_BUCKETS]

        # --- frozen reference stats (computed from baseline, never re-derived) ---
        self.ref_max_population = float(self.pop_by_district.max())
        self.ref_max_txn_count = float(self.txn_count_by_district.max())

        # --- district metadata lookup ---
        self.district_meta = self.districts.set_index("district").to_dict("index")

    # --- convenience accessors (with safe defaults for missing districts) ---
    def population(self, district: str) -> float:
        return float(self.pop_by_district.get(district, 0.0))

    def service_demand(self, district: str) -> float:
        return float(self.sdi_by_district.get(district, 0.0))

    def occupancy(self, district: str) -> float:
        return float(self.occ_by_district.get(district, 0.0))

    def txn_activity_norm(self, district: str) -> float:
        if self.ref_max_txn_count <= 0:
            return 0.0
        return float(self.txn_count_by_district.get(district, 0.0)) / self.ref_max_txn_count

    def baseline_buckets(self, district: str) -> dict[str, int]:
        if district in self.baseline_bucket_counts.index:
            return self.baseline_bucket_counts.loc[district].to_dict()
        return {b: 0 for b in config.SUPPLY_BUCKETS}


@functools.lru_cache(maxsize=1)
def get_store() -> DataStore:
    """Singleton accessor - CSVs are read exactly once per process."""
    return DataStore()
