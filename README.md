# Equilibrium — Abu Dhabi Demand-Supply Gap Simulator

Live demand-supply **Gap Score** engine for 20 Abu Dhabi districts, exposed via
FastAPI so it can be recomputed on every user edit (add/remove an amenity, adjust
population growth) in well under a second, plus a **Next.js + Leaflet** dashboard
with a choropleth + heatmap map, instant what-if scoring, and an optional,
**on-demand** AI briefing (Google Gemini or Anthropic — the only place an LLM is
touched).

> **Backend** = Python scoring engine + FastAPI (`backend/`).
> **Frontend** = Next.js dashboard (`frontend/`).

## Run it (two terminals)

```bash
# 1) backend
pip install -r requirements.txt        # add --break-system-packages on Debian/PEP-668
python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

# 2) frontend
cd frontend && npm install && npm run dev   # http://localhost:3000
```

The dashboard reads `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`, see
`frontend/.env.example`).

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

For the AI briefing only: `cp .env.example .env` and set **either** `GEMINI_API_KEY`
(Google AI Studio, free tier) **or** `ANTHROPIC_API_KEY`. `LLM_PROVIDER=auto`
(default) prefers Gemini when its key is present, else Anthropic, else a clearly
labelled rule-based fallback. The scoring engine, `/districts`, `/heatmap`,
`/simulate` and `/investment` all work without any LLM key.

---

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/districts` | – | all districts: baseline `gap_score`, lat/lon, name, supply breakdown |
| GET | `/heatmap` | – | `{meta, count, points:[{lat,lon,weight}]}` |
| POST | `/simulate` | `{district_id, amenity_overrides?, population_multiplier?}` | full `compute_gap_score()` result |
| POST | `/briefing` | `{district_id, mode:"planner"\|"investor", current_score_state}` | LLM narrative (Gemini or Anthropic) |

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

## ML investment model + live real data

The **investor figures are ML-driven and update live** with the simulation:

- **`backend/ml_investment.py`** trains a real `scikit-learn` **RandomForestRegressor**
  on the 5,000 synthetic transactions joined with district features (incl. the
  live gap score, demand, supply, yield, infrastructure) to predict
  **price_per_sqm** — R² ≈ 0.87, MAE ≈ AED 1,570. Feature importances are
  reported, so the valuation is explainable (top drivers: base sale price, unit
  size, infrastructure).
- An explainable **score layer** turns the ML valuation + real economics into an
  **Investment Score (0-100)**, **Opportunity Score** (value-add upside behind a
  closable gap) and **Risk Score**. Per the brief, a worse (higher) gap lowers
  current attractiveness while raising opportunity. Every simulation returns a
  **`scenario_delta`** = how the what-if shifts the investment case vs baseline.
- **Real eVoost market data** (`scripts/fetch_evoost.py`) pulls live Abu Dhabi
  listings, applies the connector's cleaning (rent/sale mislabel, Sharjah leak,
  null fields), and caches a per-district sale-price summary. The investment
  panel **reconciles the ML price against the real market** ("model is −3% vs
  real → potential value"). Cached to `data/evoost_*.json`; the API never calls
  the live endpoint at request time. If no key/cache, it falls back to the
  synthetic-only valuation and says so.

Endpoints added: `POST /investment` (same body as `/simulate`) and
`POST /heatmap/simulate` (heatmap recomputed with placed amenities relieving
local pressure). To refresh real data:

```bash
export UAE_DATA_API_KEY="uae_..."
python3 scripts/fetch_evoost.py
```

## Location-specific amenities (sub-district)

Beyond the per-district ± buttons, you can **place an amenity at an exact spot**
("Place on map" → pick a type → click the map, e.g. drop a clinic in a specific
part of Mussafah). The pin is attributed to the containing district, feeds the
district gap score, and — via `/heatmap/simulate` — **relieves local service
pressure around that exact location** on the heatmap (a placed facility carries
`OVERRIDE_SUPPLY_WEIGHT` local weight, configurable in `config.py`). All placed
amenities are user-hypothetical (cyan/red pins, WHAT-IF tags).

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

## Hosting the app full-stack

The app is two pieces that **both** need hosting:

1. **Frontend** — Next.js static export (`frontend/`). Can go on Vercel, Netlify,
   GitHub Pages, S3/Cloudflare — anywhere static.
2. **Backend** — FastAPI/Python (`backend/`). Needs a Python host (Render,
   Railway, Fly.io, Cloud Run). **GitHub Pages cannot run this.**

They connect via `NEXT_PUBLIC_API_URL` (frontend → backend) and CORS
(`ALLOWED_ORIGINS` on the backend, which also auto-allows `*.vercel.app`,
`*.github.io`, `*.netlify.app`, `*.onrender.com`).

### Recommended: Vercel (frontend) + Render (backend)

**Backend on Render** (a `render.yaml` blueprint is included):
1. Push this repo to GitHub.
2. Render → **New + → Blueprint** → select the repo → it reads `render.yaml`.
3. Set `GEMINI_API_KEY` (and/or `ANTHROPIC_API_KEY`) in the Render dashboard.
4. Deploy → you get a URL like `https://equilibrium-api.onrender.com`. Check
   `…/health`.

**Frontend on Vercel:**
1. Vercel → **Add New → Project** → import the repo.
2. Set **Root Directory = `frontend`**.
3. Add env var `NEXT_PUBLIC_API_URL = https://equilibrium-api.onrender.com`.
4. Deploy. Done — fully functional.

### Alternative: GitHub Pages (frontend) + Render (backend)

- The included workflow `.github/workflows/deploy-pages.yml` builds the static
  frontend and deploys to Pages on every push to `main`.
- **Enable it once:** repo **Settings → Pages → Build and deployment → Source =
  GitHub Actions**.
- Set the backend URL: repo **Settings → Secrets and variables → Actions →
  Variables → New variable** `NEXT_PUBLIC_API_URL = https://…onrender.com`.
- Site publishes at `https://<user>.github.io/equilibrium/` (the `/equilibrium`
  basePath is applied automatically for Pages builds via `GITHUB_PAGES=true`).
- Without the backend URL the page loads but shows "cannot reach the API".

### Alternative: one container (backend) + any static host

A portable `Dockerfile` builds the backend image for Railway/Fly.io/Cloud Run:

```bash
docker build -t equilibrium-api .
docker run -p 8000:8000 -e GEMINI_API_KEY=... equilibrium-api
```

### Single-origin option (no CORS)

Because the scoring/heatmap math is small and pure, it can be ported to Next.js
route handlers (TypeScript) so the whole app deploys as one Vercel project. The
ML investment model would still need the Python service (or a port to a JS ML
lib). Flagged as a follow-up, not done here.

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

## Frontend (Next.js + Leaflet)

A dark "control-room" dashboard:

- **Map** with a layer toggle (Choropleth / Heatmap / Both):
  - **Choropleth** = districts shaded by gap score. *Note:* the dataset has
    district **centroids**, not official boundaries, so cells are a **Voronoi
    approximation** from the centroids (clipped to a padded bbox). Clearly an
    approximation, not surveyed borders.
  - **Heatmap** = the sub-district service-pressure points from `/heatmap`.
- **Detail panel** (click a district): gap score, demand index, 5 supply-adequacy
  bars, and the itemised gap drivers.
- **What-if simulation**: population-growth slider + per-bucket amenity ±
  buttons → calls `/simulate` live (debounced) and recolours the district. Every
  hypothetical state is tagged **WHAT-IF** and dashed on the map.
- **Rankings** tab: all districts sorted by current gap score.
- **AI briefing**: planner/investor toggle → `/briefing` (needs `ANTHROPIC_API_KEY`).

```
frontend/src/
  app/page.tsx              # dashboard shell + state
  components/MapView.tsx     # Leaflet: Voronoi choropleth + leaflet.heat layer
  components/DistrictPanel.tsx
  components/SimulationControls.tsx
  components/BriefingPanel.tsx
  components/Legend.tsx
  lib/{api,types,color}.ts
```

## Project layout

```
backend/
  config.py        # ALL tunable assumptions (mappings, weights, benchmarks, grid)
  data_loader.py   # load 7 CSVs once + frozen reference stats
  scoring.py       # pure compute_gap_score()
  heatmap.py       # grid pressure surface
  briefing.py      # Anthropic prompts (planner/investor) — only LLM touchpoint
  main.py          # FastAPI app + CORS
frontend/          # Next.js + Leaflet dashboard
data/              # the 7 CSVs + generated heatmap_points.json
scripts/           # inspect_data, calibrate, test_scoring, build_heatmap
```
