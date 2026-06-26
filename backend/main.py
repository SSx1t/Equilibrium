"""
Equilibrium FastAPI service (Step 4).

Endpoints
  GET  /districts  -> all districts with baseline gap_score, lat/lon, name
  GET  /heatmap    -> sub-district pressure points [{lat, lon, weight}] + meta
  POST /simulate   -> live compute_gap_score(district_id, overrides, multiplier)
  POST /briefing   -> Anthropic-generated planner/investor narrative (ONLY here)

No LLM calls happen in /districts, /heatmap, or /simulate - only /briefing.
"""
from __future__ import annotations

from typing import Any, Optional

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv optional at runtime
    pass

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config
from .briefing import BriefingError, generate_briefing
from .data_loader import get_store
from .heatmap import compute_heatmap_points, heatmap_meta
from .scoring import compute_gap_score

app = FastAPI(
    title="Equilibrium - Abu Dhabi Demand-Supply Gap Simulator",
    version="1.0.0",
    description="Live district gap scoring + sub-district pressure heatmap.",
)

# CORS - allow local Next.js dev origins. Tighten for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache the heatmap (it is static given the CSVs) so repeated GETs are instant.
_HEATMAP_CACHE: Optional[list[dict]] = None


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #
class AmenityOverride(BaseModel):
    lat: float
    lon: float
    type: str = Field(..., description="bucket name or amenity word (e.g. 'healthcare', 'clinic')")
    action: str = Field(..., description="'add' or 'remove'")


class SimulateRequest(BaseModel):
    district_id: str
    amenity_overrides: Optional[list[AmenityOverride]] = None
    population_multiplier: float = 1.0


class BriefingRequest(BaseModel):
    district_id: str
    mode: str = Field("planner", description="'planner' or 'investor'")
    current_score_state: dict[str, Any]


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@app.get("/")
def root():
    return {
        "service": "Equilibrium",
        "endpoints": ["/districts", "/heatmap", "/simulate (POST)", "/briefing (POST)"],
        "note": "Amenity overrides and population multiplier are user-hypothetical, not recorded data.",
    }


@app.get("/health")
def health():
    store = get_store()
    return {"status": "ok", "districts": len(store.district_names)}


@app.get("/districts")
def list_districts():
    """Baseline gap score + map metadata for every district (powers initial load)."""
    store = get_store()
    out = []
    for name in store.district_names:
        meta = store.district_meta.get(name, {})
        res = compute_gap_score(name)  # baseline, no overrides
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


@app.get("/heatmap")
def heatmap():
    """Sub-district service-pressure points for the heatmap layer."""
    global _HEATMAP_CACHE
    if _HEATMAP_CACHE is None:
        _HEATMAP_CACHE = compute_heatmap_points()
    return {
        "meta": heatmap_meta(),
        "count": len(_HEATMAP_CACHE),
        "points": _HEATMAP_CACHE,
    }


@app.post("/simulate")
def simulate(req: SimulateRequest):
    """Recompute a single district's gap score live with user-hypothetical edits."""
    overrides = [o.model_dump() for o in (req.amenity_overrides or [])]
    try:
        result = compute_gap_score(
            district_id=req.district_id,
            amenity_overrides=overrides,
            population_multiplier=req.population_multiplier,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result


@app.post("/briefing")
def briefing(req: BriefingRequest):
    """Generate an AI briefing (Anthropic). Only endpoint that calls the LLM."""
    try:
        return generate_briefing(req.district_id, req.mode, req.current_score_state)
    except BriefingError as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)
