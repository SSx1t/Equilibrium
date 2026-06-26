# Equilibrium — Abu Dhabi Demand-Supply Gap Simulator (backend)

Live demand-supply **Gap Score** engine for 20 Abu Dhabi districts, exposed via
FastAPI so it can be recomputed on every user edit (add/remove an amenity, adjust
population growth) in well under a second. An optional, **on-demand** AI briefing
(Anthropic) is the only place an LLM is touched.

> This repo currently contains **Steps 1–4** (data inspection, scoring engine,
> heatmap layer, FastAPI service). The Next.js frontend is intentionally **not**
> built yet (per Step 5).

---

## What was built

| Step | Deliverable | File(s) |
|---|---|---|
| 1 | Data inspection (real schema, no invented columns) | `scripts/inspect_data.py`, `scripts/calibrate.py` |
| 2 | Pure `compute_gap_score()` (no LLM, < 1 ms/call) | `backend/scoring.py` |
| 3 | Sub-district pressure heatmap → `data/heatmap_points.json` | `backend/heatmap.py`, `scripts/build_heatmap.py` |
| 4 | FastAPI: `/districts`, `/heatmap`, `/simulate`, `/briefing` + CORS | `backend/main.py`, `backend/briefing.py` |

**All tunable assumptions live in one file: [`backend/config.py`](backend/config.py).**

---

## Quick start

```bash
pip install -r requirements.txt          # (add --break-system-packages on Debian/PEP-668)

# rebuild the heatmap artifact (optional; checked in)
python3 scripts/build_heatmap.py

# verify the scoring engine (baseline vs fake amenity vs +20% population, + timing)
python3 scripts/test_scoring.py

# run the API
python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

For the AI briefing only: `cp .env.example .env` and set `ANTHROPIC_API_KEY`.
The scoring engine, `/districts`, `/heatmap`, and `/simulate` work without it.

---

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/districts` | – | all districts: baseline `gap_score`, lat/lon, name, supply breakdown |
| GET | `/heatmap` | – | `{meta, count, points:[{lat,lon,weight}]}` |
| POST | `/simulate` | `{district_id, amenity_overrides?, population_multiplier?}` | full `compute_gap_score()` result |
| POST | `/briefing` | `{district_id, mode:"planner"\|"investor", current_score_state}` | Anthropic narrative (LLM call) |

`amenity_overrides` items: `{lat, lon, type, action:"add"|"remove"}` where `type`
is a bucket (`healthcare/education/transit/retail/parks`) or a familiar amenity
word (`clinic`, `school`, `bus_stop`, `supermarket`, `park`, …).

Example:
```bash
curl -X POST localhost:8000/simulate -H 'Content-Type: application/json' -d '{
  "district_id":"Al Maryah Island",
  "population_multiplier":1.2,
  "amenity_overrides":[{"lat":24.5,"lon":54.39,"type":"healthcare","action":"add"}]
}'
```

---

## Scoring model (how every number is derived)

For a district, with `pop = baseline_population × population_multiplier`:

1. **Per-capita supply** for each of 5 buckets: `per_1000 = count / pop × 1000`,
   where `count` is the real amenity count adjusted by `amenity_overrides`.
2. **Adequacy** = `min(1, per_1000 / benchmark)`; **deficit** = `1 − adequacy`.
3. **demand_intensity** ∈ ~[0.5, 1.5] from `service_demand_index`, `occupancy_rate`,
   and transaction activity (population is excluded here — it already drives
   per-capita supply).
4. **gap_score** (0–100, higher = larger unmet-demand gap) = intensity-scaled sum
   of weighted deficits; `deductions[]` itemise each bucket's contribution with a
   plain-English reason citing the real figures.

Reference stats (max population, max transaction count) are frozen at load so the
score stays stable/comparable when one district is edited live.

Data sources per signal: supply ← `osm_amenities.csv`; population/demand ←
`sample_communities.csv`; market activity ← `sample_transactions.csv`; map
coordinates ← `districts.csv`. Listings power the heatmap demand surface.

### Heatmap approach (stated explicitly)

A **regular grid** (~1.1 km cells) over the city bounding box — **not** the
district choropleth re-plotted as points. Demand = geocoded **listing** density
(6,000 points); supply = mapped **amenity** density. Both box-blurred and
normalised; `weight = clip(demand_norm − supply_norm, 0, 1)`. This gives a
genuinely smoother, sub-district view. Cell size / smoothing are in `config.py`.

---

## Assumptions you can change (all in `backend/config.py`)

Real **column names** are read from the CSV headers (nothing invented). The
following are **design choices**, flagged for review:

- **Bucket mapping**: `mobility`→transit (bus/ferry only), `community`→parks
  (park/playground/community_centre). `place_of_worship`, `bank`, `fuel_station`
  (763 amenities) are **not** counted in any bucket — documented, not dropped.
- **Bucket weights**: healthcare .25, education .20, transit .20, retail .15, parks .20.
- **Benchmarks** (amenities / 1,000 residents): healthcare .20, education .15,
  transit .20, retail .20, parks .25 — calibrated near the 75th–90th percentile
  of the real per-capita spread.
- **Demand-intensity / demand-index blend weights.**
- **Heatmap**: `GRID_CELL_DEG=0.01` (~1.1 km), `SMOOTHING_RADIUS_CELLS=1`.

> Note: with the current benchmarks, the 5 most under-served districts clip at
> exactly `gap_score = 100`, so growth on those won't push the number higher.
> Raise the benchmarks (or lower weights) if you want headroom at the top.

### Hypothetical-vs-real labelling

Amenity overrides and the population multiplier are **user-hypothetical** and never
persisted to the CSVs. Every response carries `meta.is_hypothetical` and a
`hypothetical_note`; affected deductions are tagged `[hypothetical change: …]`.
The frontend must surface these as "what-if", never as recorded data.

---

## Deploying alongside Vercel — the tradeoff (flagged, not silently chosen)

The frontend will be Next.js on Vercel. Two viable options for this Python engine:

**Option A — Keep FastAPI as a separate service (Render / Railway / Fly).**
- Pros: keep the pure-Python pandas/numpy engine as-is; clean separation; easy to
  scale the compute independently; the exact code tested here ships unchanged.
- Cons: a second deployment + URL; must set `NEXT_PUBLIC_API_URL` and tighten CORS
  to the Vercel domain; a managed instance may cold-start.

**Option B — Collapse into Next.js API routes on Vercel.**
- Pros: one deployment, one origin (no CORS), simplest ops for a hackathon.
- Cons: the scoring is **Python/pandas**. To run on Vercel you'd either (a) port
  `compute_gap_score` + heatmap to TypeScript (data is tiny — very feasible and
  arguably the cleanest end state), or (b) ship a Vercel **Python serverless
  function**, which works but has cold starts and heavier bundles for pandas.

**Recommendation for *today*:** Option A (FastAPI on Render/Railway) — zero code
change from what's already tested, fastest path to a working demo. If you want a
single-origin production app afterward, port the (small, pure) math to a Next.js
route handler (Option B-a). Either way the math lives in one place (`config.py` +
`scoring.py`) and is straightforward to translate.

For production with Option A: set `allow_origins` in `backend/main.py` to your
Vercel URL and run `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.

---

## Project layout

```
backend/
  config.py        # ALL tunable assumptions (mappings, weights, benchmarks, grid)
  data_loader.py   # load 7 CSVs once + frozen reference stats
  scoring.py       # pure compute_gap_score()
  heatmap.py       # grid pressure surface
  briefing.py      # Anthropic prompts (planner/investor) — only LLM touchpoint
  main.py          # FastAPI app + CORS
data/              # the 7 CSVs + generated heatmap_points.json
scripts/           # inspect_data, calibrate, test_scoring, build_heatmap
```
