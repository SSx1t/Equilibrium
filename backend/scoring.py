"""
Core scoring engine.

compute_gap_score() is a PURE, fast function (pandas/numpy math only, no I/O,
no network, no LLM). It is safe to call repeatedly (e.g. on every slider move).

Model summary (all tunables live in config.py):
  - Supply: count of amenities in each of 5 buckets, adjusted by the user's
    in-memory amenity_overrides, expressed per 1,000 residents.
  - Population: baseline district population x population_multiplier (growth).
  - Per bucket: adequacy = min(1, per_1000 / benchmark); deficit = 1 - adequacy.
  - demand_intensity (from service_demand_index, occupancy, transaction activity)
    modulates how much each deficit hurts.
  - gap_score (0-100, higher = bigger unmet-demand gap) = intensity-scaled sum of
    weighted deficits. deductions[] itemise each bucket's contribution.
"""
from __future__ import annotations

from typing import Optional

from . import config
from .data_loader import get_store

# Map common raw amenity subtypes/aliases to the 5 buckets, so an override's
# `type` can be either a bucket name or a familiar amenity word.
_TYPE_ALIASES = {
    "clinic": "healthcare", "hospital": "healthcare", "pharmacy": "healthcare",
    "doctors": "healthcare", "doctor": "healthcare", "health": "healthcare",
    "school": "education", "university": "education", "college": "education",
    "kindergarten": "education", "nursery": "education",
    "bus_stop": "transit", "bus_station": "transit", "ferry_terminal": "transit",
    "metro": "transit", "tram": "transit", "station": "transit",
    "supermarket": "retail", "mall": "retail", "marketplace": "retail",
    "shop": "retail", "store": "retail",
    "park": "parks", "playground": "parks", "community_centre": "parks",
    "garden": "parks", "green": "parks",
}


def _resolve_bucket(raw_type: str) -> Optional[str]:
    if raw_type is None:
        return None
    t = str(raw_type).strip().lower().replace(" ", "_")
    if t in config.SUPPLY_BUCKETS:
        return t
    return _TYPE_ALIASES.get(t)


def _clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _apply_overrides(counts: dict[str, int], overrides) -> tuple[dict[str, float], dict[str, int], list]:
    """Return (new_counts, net_delta_per_bucket, ignored_overrides)."""
    counts = dict(counts)
    delta = {b: 0 for b in config.SUPPLY_BUCKETS}
    ignored = []
    for ov in overrides or []:
        bucket = _resolve_bucket(ov.get("type"))
        action = str(ov.get("action", "")).strip().lower()
        if bucket is None or action not in ("add", "remove"):
            ignored.append(ov)
            continue
        if action == "add":
            counts[bucket] = counts.get(bucket, 0) + 1
            delta[bucket] += 1
        else:  # remove
            new_val = max(0, counts.get(bucket, 0) - 1)
            delta[bucket] -= counts.get(bucket, 0) - new_val
            counts[bucket] = new_val
    return counts, delta, ignored


def compute_gap_score(
    district_id: str,
    amenity_overrides: Optional[list] = None,
    population_multiplier: float = 1.0,
) -> dict:
    """Pure scoring function. See module docstring for the model."""
    store = get_store()

    if district_id not in store.district_names:
        raise KeyError(f"Unknown district_id: {district_id!r}")

    population_multiplier = float(population_multiplier)

    base_counts = store.baseline_buckets(district_id)
    counts, delta, ignored = _apply_overrides(base_counts, amenity_overrides)

    base_pop = store.population(district_id)
    pop = base_pop * population_multiplier
    pop = max(pop, 1.0)  # guard against divide-by-zero

    sdi = store.service_demand(district_id)          # 0-100
    occ = store.occupancy(district_id)               # 0-1
    txn_norm = store.txn_activity_norm(district_id)  # 0-1

    # --- demand intensity (modulates deficit pain), range ~[0.5, 1.5] ---
    b = config.DEMAND_BLEND
    demand_intensity = config.DEMAND_FLOOR + (
        b["service_demand_index"] * (sdi / 100.0)
        + b["occupancy_rate"] * occ
        + b["transaction_activity"] * txn_norm
    )

    # --- per bucket adequacy / deficit ---
    supply_breakdown: dict[str, float] = {}
    raw_points: dict[str, float] = {}
    per_k_by_bucket: dict[str, float] = {}
    for bucket in config.SUPPLY_BUCKETS:
        cnt = counts.get(bucket, 0)
        per_k = (cnt / pop) * 1000.0
        benchmark = config.BENCHMARK_PER_1000[bucket]
        adequacy = _clip(per_k / benchmark, 0.0, 1.0) if benchmark > 0 else 1.0
        deficit = 1.0 - adequacy
        weight = config.BUCKET_WEIGHTS[bucket]
        raw_points[bucket] = deficit * weight * 100.0
        per_k_by_bucket[bucket] = per_k
        supply_breakdown[bucket] = round(adequacy * 100.0, 1)

    # --- intensity-scaled contributions, normalised so they sum to gap_score ---
    scaled = {bk: pts * demand_intensity for bk, pts in raw_points.items()}
    total = sum(scaled.values())
    gap_score = _clip(total, 0.0, 100.0)
    norm = (gap_score / total) if total > 0 else 0.0

    deductions = []
    for bucket in config.SUPPLY_BUCKETS:
        points = round(scaled[bucket] * norm, 2)
        cnt = int(counts.get(bucket, 0))
        per_k = per_k_by_bucket[bucket]
        benchmark = config.BENCHMARK_PER_1000[bucket]
        pct_of_target = round((per_k / benchmark) * 100.0, 0) if benchmark > 0 else 100.0
        served = supply_breakdown[bucket] >= 100.0
        reason = (
            f"{cnt} {bucket} amenities for {pop:,.0f} residents "
            f"= {per_k:.3f} per 1,000 vs benchmark {benchmark:.2f} "
            f"({pct_of_target:.0f}% of target)."
        )
        if delta[bucket] != 0:
            sign = "+" if delta[bucket] > 0 else ""
            reason += f" [hypothetical change: {sign}{delta[bucket]} {bucket}]"
        if served:
            reason += " Adequately served."
        deductions.append(
            {
                "category": bucket,
                "points": points,
                "reason": reason,
                "supply_count": cnt,
                "per_1000_residents": round(per_k, 4),
                "benchmark_per_1000": benchmark,
            }
        )
    deductions.sort(key=lambda d: d["points"], reverse=True)

    # --- reported demand_index (0-100, rises with population growth) ---
    di = config.DEMAND_INDEX_BLEND
    pop_cap = store.ref_max_population * config.POP_INDEX_HEADROOM
    pop_norm = _clip(pop / pop_cap, 0.0, 1.0) * 100.0 if pop_cap > 0 else 0.0
    demand_index = (
        di["population"] * pop_norm
        + di["service_demand_index"] * sdi
        + di["occupancy_rate"] * (occ * 100.0)
    )

    is_hypothetical = bool(
        (amenity_overrides and any(o not in ignored for o in amenity_overrides))
        or abs(population_multiplier - 1.0) > 1e-9
    )

    return {
        "gap_score": round(gap_score, 2),
        "demand_index": round(demand_index, 2),
        "supply_breakdown": supply_breakdown,
        "deductions": deductions,
        # ---- additive metadata (not part of the required 4 keys) ----
        "meta": {
            "district_id": district_id,
            "population_baseline": int(base_pop),
            "population_simulated": int(round(pop)),
            "population_multiplier": population_multiplier,
            "demand_intensity": round(demand_intensity, 4),
            "service_demand_index": round(sdi, 2),
            "occupancy_rate": round(occ, 4),
            "transaction_activity_norm": round(txn_norm, 4),
            "bucket_counts_used": {b: int(counts.get(b, 0)) for b in config.SUPPLY_BUCKETS},
            "bucket_counts_baseline": {b: int(base_counts.get(b, 0)) for b in config.SUPPLY_BUCKETS},
            "amenity_override_delta": delta,
            "ignored_overrides": ignored,
            "is_hypothetical": is_hypothetical,
            "hypothetical_note": (
                "Gap score reflects user-hypothetical edits (amenity overrides "
                "and/or population growth). These are NOT recorded data."
                if is_hypothetical
                else "Baseline score from recorded data; no hypothetical edits applied."
            ),
        },
    }
