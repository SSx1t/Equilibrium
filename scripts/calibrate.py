"""Quick calibration: real amenities-per-1000-residents per district per bucket,
so default benchmarks in config.py are grounded in the actual data spread."""
import pandas as pd
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
am = pd.read_csv(DATA / "osm_amenities.csv")
com = pd.read_csv(DATA / "sample_communities.csv")
txn = pd.read_csv(DATA / "sample_transactions.csv")

# bucket mapping (category, subtype) -> 5 buckets
TRANSIT_SUB = {"bus_stop", "bus_station", "ferry_terminal"}
PARK_SUB = {"park", "playground", "community_centre"}

def bucket(row):
    cat, sub = row["category"], row["subtype"]
    if cat == "healthcare":
        return "healthcare"
    if cat == "education":
        return "education"
    if cat == "retail":
        return "retail"
    if cat == "mobility" and sub in TRANSIT_SUB:
        return "transit"
    if cat == "community" and sub in PARK_SUB:
        return "parks"
    return None

am["bucket"] = am.apply(bucket, axis=1)
pop = com.groupby("district")["population_estimate"].sum()
counts = am.dropna(subset=["bucket"]).groupby(["district", "bucket"]).size().unstack(fill_value=0)

per_k = counts.div(pop, axis=0) * 1000
print("Amenities per 1,000 residents, per district per bucket:")
print(per_k.round(3).to_string())
print("\nPer-bucket distribution (per 1,000 residents):")
print(per_k.describe(percentiles=[.1,.25,.5,.75,.9]).round(3).to_string())
print("\nTotal population per district (sum of communities):")
print(pop.sort_values(ascending=False).to_string())
print("\nTransaction counts per district:")
print(txn.groupby("district").size().sort_values(ascending=False).to_string())
print("\nUnmapped amenities (not in any of 5 buckets):", int(am['bucket'].isna().sum()))
print(am[am['bucket'].isna()].groupby(['category','subtype']).size().to_string())
