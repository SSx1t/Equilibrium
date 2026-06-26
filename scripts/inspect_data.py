"""Step 1 - Data inspection. Loads all 7 CSVs and reports schema, dtypes,
row counts, and 3 sample rows each. Does NOT assume/invent any columns."""
import pandas as pd
from pathlib import Path

pd.set_option("display.max_columns", None)
pd.set_option("display.width", 200)

DATA = Path(__file__).resolve().parent.parent / "data"

FILES = [
    "districts.csv",
    "osm_amenities.csv",
    "sample_communities.csv",
    "sample_listings.csv",
    "sample_investors.csv",
    "sample_transactions.csv",
    "sample_parcels.csv",
]

for fname in FILES:
    path = DATA / fname
    df = pd.read_csv(path)
    print("=" * 100)
    print(f"FILE: {fname}")
    print(f"  rows: {len(df):,}   cols: {len(df.columns)}")
    print("-" * 100)
    print("  COLUMNS / DTYPES:")
    for col, dt in df.dtypes.items():
        n_null = df[col].isna().sum()
        n_uniq = df[col].nunique(dropna=True)
        print(f"    {col:<28} {str(dt):<10} nulls={n_null:<5} unique={n_uniq}")
    print("-" * 100)
    print("  3 SAMPLE ROWS:")
    print(df.head(3).to_string(index=False))
    print()

# Cross-file key check: how do districts join?
print("=" * 100)
print("DISTRICT KEY OVERLAP CHECK (how files join on 'district')")
print("=" * 100)
districts = set(pd.read_csv(DATA / "districts.csv")["district"])
print(f"districts.csv districts ({len(districts)}): {sorted(districts)}")
for fname in ["osm_amenities.csv", "sample_communities.csv", "sample_transactions.csv", "sample_listings.csv", "sample_parcels.csv"]:
    df = pd.read_csv(DATA / fname)
    if "district" in df.columns:
        d = set(df["district"].dropna())
        print(f"\n{fname}: {len(d)} distinct districts")
        print(f"  in districts.csv:     {sorted(d & districts)}")
        print(f"  NOT in districts.csv: {sorted(d - districts)}")

print("\n" + "=" * 100)
print("AMENITY CATEGORY / SUBTYPE BREAKDOWN (osm_amenities.csv)")
print("=" * 100)
am = pd.read_csv(DATA / "osm_amenities.csv")
print("category value counts:")
print(am["category"].value_counts().to_string())
print("\nsubtype value counts (top 40):")
print(am["subtype"].value_counts().head(40).to_string())
