"""
Pull REAL Abu Dhabi listings from the eVoost live data API, apply the
documented cleaning (mislabeled rent/sale, Sharjah leak, null fields), and
cache the result to data/evoost_listings.json plus a per-district price summary
in data/evoost_district_prices.json.

Run once (be kind to the dev API). The backend reads the cached files; it never
calls the live API at request time. If the API is unreachable, the backend
falls back to synthetic-only and clearly says so.

    export UAE_DATA_API_KEY="uae_..."
    python3 scripts/fetch_evoost.py
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.data_loader import get_store  # noqa: E402

BASE = "https://uae-data-api.evoost-ai.workers.dev/v1"
RENT_SALE_THRESHOLD = 1_000_000  # AED/yr above this => almost certainly a sale
DATA = Path(__file__).resolve().parent.parent / "data"


def _get(path: str) -> dict:
    key = os.environ.get("UAE_DATA_API_KEY")
    if not key:
        raise SystemExit("UAE_DATA_API_KEY not set.")
    req = urllib.request.Request(
        BASE + path,
        headers={
            "x-api-key": key,
            "Accept": "application/json",
            "User-Agent": "equilibrium-connector/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def fetch_listings(emirate="Abu Dhabi", max_pages=12, page_size=100) -> pd.DataFrame:
    rows: list[dict] = []
    for page in range(1, max_pages + 1):
        params = {"emirate": emirate, "limit": page_size, "page": page}
        data = _get("/listings/search?" + urllib.parse.urlencode(params))
        items = data.get("items", [])
        if not items:
            break
        rows.extend(items)
        print(f"  page {page}: +{len(items)} (total {len(rows)})")
        time.sleep(0.25)
    return pd.DataFrame(rows)


def known_ad_areas() -> set[str]:
    items = _get("/areas").get("items", [])
    return {a["name"] for a in items if a.get("emirate") == "Abu Dhabi"}


def clean(df: pd.DataFrame, ad_areas: set[str]) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    df = df[(df["price"].fillna(0) > 0) & (df["built_up_area_sqm"].fillna(0) > 0)]
    df["price_looks_like_sale"] = df["price"] > RENT_SALE_THRESHOLD
    df["transaction_type_guess"] = df.apply(
        lambda r: "sale"
        if r["price_looks_like_sale"]
        else (r.get("transaction_type") or "rent"),
        axis=1,
    )
    df["price_per_sqm"] = (df["price"] / df["built_up_area_sqm"]).round(0)
    df["area_in_abu_dhabi"] = df["area"].isin(ad_areas) | df["area"].isna()
    df = df[df["area_in_abu_dhabi"]]
    return df.reset_index(drop=True)


def main() -> None:
    print("Fetching live Abu Dhabi listings (real, messy data) ...")
    try:
        ad_areas = known_ad_areas()
        raw = fetch_listings(max_pages=12)
        df = clean(raw, ad_areas)
    except Exception as e:  # noqa: BLE001
        print(f"!! eVoost fetch failed: {e}")
        print("   Backend will fall back to synthetic-only market grounding.")
        return

    if df.empty:
        print("No usable rows after cleaning.")
        return

    print(f"\n{len(df)} usable listings after cleaning.")
    print("by guessed type:\n", df["transaction_type_guess"].value_counts().to_string())

    # cache raw cleaned listings (only columns we need, keep small)
    keep = [
        "id", "transaction_type", "transaction_type_guess", "price",
        "price_per_sqm", "area", "property_type", "bedrooms", "built_up_area_sqm",
        "price_looks_like_sale", "updated_at",
    ]
    keep = [c for c in keep if c in df.columns]
    (DATA / "evoost_listings.json").write_text(
        df[keep].to_json(orient="records")
    )

    # per-district SALE price summary (our districts == area names)
    store = get_store()
    sale = df[df["transaction_type_guess"] == "sale"]
    summary: dict[str, dict] = {}
    for d in store.district_names:
        sub = sale[sale["area"] == d]
        if len(sub) >= 3:
            summary[d] = {
                "n_sale_listings": int(len(sub)),
                "median_price_per_sqm": float(sub["price_per_sqm"].median()),
                "p25_price_per_sqm": float(sub["price_per_sqm"].quantile(0.25)),
                "p75_price_per_sqm": float(sub["price_per_sqm"].quantile(0.75)),
            }
    meta = {
        "source": "eVoost live UAE data API (real scraped listings)",
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_usable_listings": int(len(df)),
        "total_sale_listings": int(len(sale)),
        "districts_with_summary": len(summary),
        "cleaning": "dropped null/zero price+area, price-based rent/sale guess, Abu Dhabi area filter",
    }
    (DATA / "evoost_district_prices.json").write_text(
        json.dumps({"meta": meta, "districts": summary}, indent=1)
    )
    print(f"\nCached {len(df)} listings + price summary for {len(summary)} districts.")
    print("districts with real sale data:", sorted(summary.keys()))


if __name__ == "__main__":
    main()
