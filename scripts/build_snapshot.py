"""
Generate a static baseline snapshot of the read-only API responses
(`/districts` and `/heatmap`) and write it into the frontend bundle.

The frontend uses this snapshot to render the map, choropleth, heatmap and
district list INSTANTLY on first load — even while the Render free-tier backend
is still waking up from its ~50s cold start. Once the live API responds, the
frontend transparently swaps the snapshot for live data.

These two endpoints are deterministic for the baseline (no user input), so the
snapshot matches what the live API returns until `config.py`/data changes. Run
this script again after changing scoring assumptions or the underlying CSVs:

    python scripts/build_snapshot.py
"""
from __future__ import annotations

import json
from pathlib import Path

from backend.data_loader import get_store
from backend.heatmap import compute_heatmap_points, heatmap_meta
from backend.scoring import compute_gap_score

OUT = (
    Path(__file__).resolve().parent.parent
    / "frontend"
    / "src"
    / "data"
    / "snapshot.json"
)


def build_districts() -> dict:
    store = get_store()
    out = []
    for name in store.district_names:
        meta = store.district_meta.get(name, {})
        res = compute_gap_score(name)
        out.append(
            {
                "district_id": name,
                "name": name,
                "lat": float(meta.get("latitude")),
                "lon": float(meta.get("longitude")),
                "gap_score": res["gap_score"],
                "demand_index": res["demand_index"],
                "supply_breakdown": res["supply_breakdown"],
                "area_type": meta.get("area_type"),
                "profile": meta.get("profile"),
                "population": res["meta"]["population_baseline"],
                "is_hypothetical": False,
            }
        )
    return {"count": len(out), "districts": out}


def build_heatmap() -> dict:
    points = compute_heatmap_points()
    return {"meta": heatmap_meta(), "count": len(points), "points": points}


def main() -> None:
    snapshot = {
        "generated_by": "scripts/build_snapshot.py",
        "note": (
            "Static baseline used for instant first paint while the API wakes "
            "from cold start. Regenerate after changing config.py or data."
        ),
        "districts": build_districts(),
        "heatmap": build_heatmap(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snapshot, separators=(",", ":")))
    size_kb = OUT.stat().st_size / 1024
    print(
        f"Wrote {OUT.relative_to(OUT.parents[3])} "
        f"({snapshot['districts']['count']} districts, "
        f"{snapshot['heatmap']['count']} heat points, {size_kb:.1f} KB)"
    )


if __name__ == "__main__":
    main()
