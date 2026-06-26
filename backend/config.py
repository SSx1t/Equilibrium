"""
Equilibrium - central configuration & ALL tunable assumptions.
=============================================================

Every value in this file is a DESIGN ASSUMPTION made by the build, not a fact
read from the CSVs. They are gathered here (and nowhere else) so they can be
reviewed and changed in one place. The actual *column names* used are the real
ones read from the CSV headers (see data_loader.py) - nothing here invents data.

If you want to change how the Gap Score behaves, this is the only file to edit:
  - which amenity category/subtype maps to which of the 5 supply buckets
  - the weight of each bucket in the gap score
  - the per-1,000-resident "adequate supply" benchmark for each bucket
  - the demand-intensity blend weights
  - the heatmap grid cell size and smoothing radius
"""
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# ---------------------------------------------------------------------------
# CSV file paths (real files copied into ./data)
# ---------------------------------------------------------------------------
CSV = {
    "districts": DATA_DIR / "districts.csv",
    "amenities": DATA_DIR / "osm_amenities.csv",
    "communities": DATA_DIR / "sample_communities.csv",
    "listings": DATA_DIR / "sample_listings.csv",
    "investors": DATA_DIR / "sample_investors.csv",
    "transactions": DATA_DIR / "sample_transactions.csv",
    "parcels": DATA_DIR / "sample_parcels.csv",
}

# ---------------------------------------------------------------------------
# The 5 supply buckets required by the spec.
# ---------------------------------------------------------------------------
SUPPLY_BUCKETS = ["healthcare", "education", "transit", "retail", "parks"]

# ---------------------------------------------------------------------------
# ASSUMPTION 1 - mapping osm_amenities (category, subtype) -> 5 supply buckets.
# Based on the real category/subtype values found in osm_amenities.csv.
# Any amenity not matched here is EXCLUDED from the supply score (see
# UNMAPPED_NOTE). Override by editing the sets below.
# ---------------------------------------------------------------------------
# Whole categories that map 1:1 to a bucket:
CATEGORY_TO_BUCKET = {
    "healthcare": "healthcare",   # hospital, clinic, pharmacy, doctors
    "education": "education",      # school, university, college, kindergarten
    "retail": "retail",           # supermarket, mall, marketplace
}
# Categories that only partially map, resolved by subtype:
TRANSIT_SUBTYPES = {"bus_stop", "bus_station", "ferry_terminal"}   # from category "mobility"
PARK_SUBTYPES = {"park", "playground", "community_centre"}          # from category "community"

# Amenities deliberately NOT counted in any bucket (documented, not silently dropped):
#   community/place_of_worship (447), services/bank (204), services/fuel_station (112)
UNMAPPED_NOTE = "place_of_worship, bank and fuel_station are not counted in any supply bucket."

# ---------------------------------------------------------------------------
# ASSUMPTION 2 - weight of each bucket in the gap score (must sum to 1.0).
# Higher weight = a deficit in that bucket hurts the gap score more.
# ---------------------------------------------------------------------------
BUCKET_WEIGHTS = {
    "healthcare": 0.25,
    "education": 0.20,
    "transit": 0.20,
    "retail": 0.15,
    "parks": 0.20,
}

# ---------------------------------------------------------------------------
# ASSUMPTION 3 - "adequate supply" benchmark, amenities per 1,000 residents.
# A district that meets the benchmark for a bucket has ZERO deficit there.
# These were calibrated to the real per-capita spread in the data (set near
# the 75th-90th percentile so most districts show some unmet demand, which is
# the point of a gap simulator). Lower a benchmark to be more lenient.
# ---------------------------------------------------------------------------
BENCHMARK_PER_1000 = {
    "healthcare": 0.20,
    "education": 0.15,
    "transit": 0.20,
    "retail": 0.20,
    "parks": 0.25,
}

# ---------------------------------------------------------------------------
# ASSUMPTION 4 - demand-intensity blend. Modulates how punishing deficits are:
# a district with the same per-capita supply but higher underlying demand gets
# a larger gap. Population is intentionally NOT in this blend (population drives
# the per-capita supply directly via population_multiplier). Range ~[0.5, 1.5].
#   intensity = DEMAND_FLOOR + (w_sdi*service_demand + w_occ*occupancy + w_txn*txn_activity)
# ---------------------------------------------------------------------------
DEMAND_FLOOR = 0.5
DEMAND_BLEND = {
    "service_demand_index": 0.5,   # sample_communities.service_demand_index (0-100)
    "occupancy_rate": 0.3,         # sample_communities.occupancy_rate (0-1)
    "transaction_activity": 0.2,   # sample_transactions count per district (normalised 0-1)
}

# ---------------------------------------------------------------------------
# ASSUMPTION 5 - reported demand_index blend (0-100, for display only). Reflects
# the absolute demand level of a district and DOES scale with population growth.
# ---------------------------------------------------------------------------
DEMAND_INDEX_BLEND = {
    "population": 0.5,             # normalised vs baseline max population
    "service_demand_index": 0.3,  # 0-100
    "occupancy_rate": 0.2,        # 0-1 -> x100
}
# Population headroom: how far above the baseline max population the population
# component may climb (so growth via population_multiplier is visible). 1.5 =
# allow up to +50% beyond today's largest district before the component caps.
POP_INDEX_HEADROOM = 1.5

# ---------------------------------------------------------------------------
# ASSUMPTION 6 - heatmap grid. Sub-district resolution via a regular grid over
# the city bounding box (derived from amenity lat/lon). Demand proxy = listing
# point density (6,000 geocoded listings); supply proxy = amenity point density.
# ---------------------------------------------------------------------------
GRID_CELL_DEG = 0.01          # ~1.1 km cells (latitude degrees)
SMOOTHING_RADIUS_CELLS = 1    # box-blur radius in cells applied to demand & supply
HEATMAP_MIN_WEIGHT = 0.05     # drop near-zero-pressure cells from the output
HEATMAP_BBOX_PAD_DEG = 0.01   # pad the bounding box slightly beyond extreme points

# ---------------------------------------------------------------------------
# Anthropic / briefing
# ---------------------------------------------------------------------------
ANTHROPIC_MODEL = "claude-sonnet-4-6"
ANTHROPIC_MAX_TOKENS = 900
