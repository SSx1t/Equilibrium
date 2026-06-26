"""
ML-driven investment model.

Two layers, both responsive to the LIVE (simulated) district state:

  1) A real scikit-learn regression (RandomForest) trained on the synthetic
     transactions (5,000 rows) joined with district features, predicting
     price_per_sqm. This is genuine supervised ML on the data; feature
     importances are reported so the valuation is explainable. The live gap
     score / demand / supply are inputs, so simulation re-values the district.

  2) A transparent, explainable scoring layer that turns the ML valuation +
     real economics (gross yield, demand, service gap, infrastructure) into an
     Investment Score (0-100) and an Opportunity Score. Per the user's intent,
     a worse (higher) gap lowers current attractiveness, while latent demand
     behind a closable gap raises the value-add opportunity.

Real eVoost market prices (cached) are used to reconcile the ML valuation
against actual listings ("looks under/over-priced vs real market").
"""
from __future__ import annotations

import functools
import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from . import config
from .data_loader import get_store
from .scoring import compute_gap_score

DATA = Path(__file__).resolve().parent.parent / "data"

NUM_FEATURES = [
    "size_sqm",
    "year",
    "gap_score",
    "demand_index",
    "supply_healthcare",
    "supply_education",
    "supply_transit",
    "supply_retail",
    "supply_parks",
    "infrastructure_score",
    "gross_yield_pct",
    "base_sale_aed_sqm",
    "population",
    "established_year",
]
CAT_FEATURES = ["asset_type", "buyer_type", "area_type", "profile"]


def _district_feature_row(district_id: str, score) -> dict:
    """District-level features from a (live or baseline) score result."""
    store = get_store()
    meta = store.district_meta[district_id]
    sb = score["supply_breakdown"]
    return {
        "gap_score": score["gap_score"],
        "demand_index": score["demand_index"],
        "supply_healthcare": sb["healthcare"],
        "supply_education": sb["education"],
        "supply_transit": sb["transit"],
        "supply_retail": sb["retail"],
        "supply_parks": sb["parks"],
        "infrastructure_score": meta["infrastructure_score"],
        "gross_yield_pct": meta["gross_yield_pct"],
        "base_sale_aed_sqm": meta["base_sale_aed_sqm"],
        "population": score["meta"]["population_simulated"],
        "established_year": meta["established_year"],
        "area_type": meta["area_type"],
        "profile": meta["profile"],
    }


class InvestmentModel:
    def __init__(self) -> None:
        store = get_store()

        # --- build training frame: transactions x district baseline features ---
        baseline = {d: compute_gap_score(d) for d in store.district_names}
        dfeat = pd.DataFrame(
            {d: _district_feature_row(d, baseline[d]) for d in store.district_names}
        ).T
        dfeat.index.name = "district"
        dfeat = dfeat.reset_index()

        txn = store.transactions.copy()
        txn["year"] = pd.to_datetime(txn["date"], errors="coerce").dt.year
        txn = txn.rename(columns={"price_per_sqm": "target_ppsqm"})
        train = txn.merge(dfeat, on="district", how="left")
        train = train.dropna(subset=["target_ppsqm", "size_sqm", "year"])

        X = train[NUM_FEATURES + CAT_FEATURES]
        y = train["target_ppsqm"].astype(float)

        pre = ColumnTransformer(
            transformers=[
                ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
            ],
            remainder="passthrough",
        )
        self.pipe = Pipeline(
            [
                ("pre", pre),
                (
                    "rf",
                    RandomForestRegressor(
                        n_estimators=200,
                        max_depth=12,
                        min_samples_leaf=3,
                        random_state=42,
                        n_jobs=-1,
                    ),
                ),
            ]
        )

        X_tr, X_te, y_tr, y_te = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        self.pipe.fit(X_tr, y_tr)
        pred_te = self.pipe.predict(X_te)
        self.metrics = {
            "model": "RandomForestRegressor",
            "target": "price_per_sqm (AED)",
            "n_train": int(len(X_tr)),
            "n_test": int(len(X_te)),
            "r2": round(float(r2_score(y_te, pred_te)), 3),
            "mae_aed": round(float(mean_absolute_error(y_te, pred_te)), 0),
        }

        # feature importances (map back through the preprocessor)
        try:
            ohe = self.pipe.named_steps["pre"].named_transformers_["cat"]
            cat_names = list(ohe.get_feature_names_out(CAT_FEATURES))
            names = cat_names + NUM_FEATURES
            imps = self.pipe.named_steps["rf"].feature_importances_
            top = sorted(zip(names, imps), key=lambda x: x[1], reverse=True)[:8]
            self.top_features = [
                {"feature": n, "importance": round(float(i), 3)} for n, i in top
            ]
        except Exception:  # noqa: BLE001
            self.top_features = []

        # representative transaction profile for per-district prediction
        self.repr_size = float(txn["size_sqm"].median())
        self.repr_asset = str(txn["asset_type"].mode().iloc[0])
        self.repr_buyer = str(txn["buyer_type"].mode().iloc[0])
        self.repr_year = int(txn["year"].max())

        # --- frozen reference distributions for normalisation (baseline) ---
        self.baseline_pred = {
            d: self._predict_price(d, baseline[d]) for d in store.district_names
        }
        preds = np.array(list(self.baseline_pred.values()))
        self.pred_min, self.pred_max = float(preds.min()), float(preds.max())
        yields = np.array(
            [store.district_meta[d]["gross_yield_pct"] for d in store.district_names]
        )
        self.yield_min, self.yield_max = float(yields.min()), float(yields.max())

        # baseline investment score per district (for scenario deltas)
        self.baseline_invest = {
            d: self._score_from(d, baseline[d], self.baseline_pred[d])[
                "investment_score"
            ]
            for d in store.district_names
        }

        # --- real eVoost market prices (optional grounding) ---
        self.real_prices = {}
        self.real_meta = None
        p = DATA / "evoost_district_prices.json"
        if p.exists():
            try:
                blob = json.loads(p.read_text())
                self.real_prices = blob.get("districts", {})
                self.real_meta = blob.get("meta")
            except Exception:  # noqa: BLE001
                pass

    # ------------------------------------------------------------------ #
    def _predict_price(self, district_id: str, score) -> float:
        row = _district_feature_row(district_id, score)
        row.update(
            {
                "size_sqm": self.repr_size,
                "year": self.repr_year,
                "asset_type": self.repr_asset,
                "buyer_type": self.repr_buyer,
            }
        )
        X = pd.DataFrame([row])[NUM_FEATURES + CAT_FEATURES]
        return float(self.pipe.predict(X)[0])

    def _norm(self, v, lo, hi) -> float:
        if hi <= lo:
            return 0.5
        return max(0.0, min(1.0, (v - lo) / (hi - lo)))

    def _score_from(self, district_id: str, score, pred_price: float) -> dict:
        store = get_store()
        meta = store.district_meta[district_id]
        gap = score["gap_score"]
        demand = score["demand_index"]

        market_strength = self._norm(pred_price, self.pred_min, self.pred_max)
        yield_norm = self._norm(meta["gross_yield_pct"], self.yield_min, self.yield_max)
        demand_norm = max(0.0, min(1.0, demand / 100.0))
        service_norm = max(0.0, min(1.0, 1.0 - gap / 100.0))
        infra_norm = max(0.0, min(1.0, meta["infrastructure_score"] / 100.0))

        investment_score = 100.0 * (
            0.25 * service_norm
            + 0.20 * yield_norm
            + 0.20 * demand_norm
            + 0.20 * market_strength
            + 0.15 * infra_norm
        )
        # value-add upside: latent demand behind a closable gap
        opportunity_score = 100.0 * (gap / 100.0) * (0.5 + 0.5 * demand_norm)
        # service-strain risk grows with gap and population pressure
        risk_score = 100.0 * (0.6 * (gap / 100.0) + 0.4 * demand_norm)

        return {
            "investment_score": round(investment_score, 1),
            "opportunity_score": round(opportunity_score, 1),
            "risk_score": round(risk_score, 1),
            "components": {
                "market_strength": round(market_strength * 100, 1),
                "yield": round(yield_norm * 100, 1),
                "demand": round(demand_norm * 100, 1),
                "service_level": round(service_norm * 100, 1),
                "infrastructure": round(infra_norm * 100, 1),
            },
        }

    def _rating(self, s: float) -> str:
        if s >= 70:
            return "Strong"
        if s >= 55:
            return "Attractive"
        if s >= 40:
            return "Moderate"
        return "Caution"

    # ------------------------------------------------------------------ #
    def evaluate(self, district_id: str, score) -> dict:
        store = get_store()
        meta = store.district_meta[district_id]
        pred_price = self._predict_price(district_id, score)
        scored = self._score_from(district_id, score, pred_price)

        gross_yield = meta["gross_yield_pct"]
        annual_rent_per_sqm = pred_price * gross_yield / 100.0
        payback_years = round(100.0 / gross_yield, 1) if gross_yield else None

        baseline_invest = self.baseline_invest[district_id]
        delta = round(scored["investment_score"] - baseline_invest, 1)

        # real-market reconciliation (if we have eVoost data for this district)
        real = None
        rp = self.real_prices.get(district_id)
        if rp:
            real_med = rp["median_price_per_sqm"]
            prem = (pred_price - real_med) / real_med * 100.0
            real = {
                "n_real_sale_listings": rp["n_sale_listings"],
                "real_median_price_per_sqm": round(real_med),
                "model_vs_real_pct": round(prem, 1),
                "verdict": (
                    "model below real market (potential value)"
                    if prem < -5
                    else "model above real market (caution)"
                    if prem > 5
                    else "model in line with real market"
                ),
            }

        return {
            "district_id": district_id,
            "ml": {
                "expected_price_per_sqm_aed": round(pred_price),
                "expected_annual_rent_per_sqm_aed": round(annual_rent_per_sqm),
                "gross_yield_pct": gross_yield,
                "payback_years": payback_years,
                "model_metrics": self.metrics,
                "top_features": self.top_features,
            },
            "investment_score": scored["investment_score"],
            "opportunity_score": scored["opportunity_score"],
            "risk_score": scored["risk_score"],
            "rating": self._rating(scored["investment_score"]),
            "score_components": scored["components"],
            "baseline_investment_score": baseline_invest,
            "scenario_delta": delta,
            "is_hypothetical": bool(score["meta"]["is_hypothetical"]),
            "real_market": real,
            "real_market_meta": self.real_meta,
            "note": (
                "Investment figures are ML-grounded (RandomForest price model) plus an "
                "explainable score layer. Scenario edits (amenities / population) are "
                "user-hypothetical and shift the investment case shown by 'scenario_delta'."
            ),
        }


@functools.lru_cache(maxsize=1)
def get_model() -> InvestmentModel:
    return InvestmentModel()


def evaluate_investment(
    district_id: str,
    amenity_overrides: Optional[list] = None,
    population_multiplier: float = 1.0,
) -> dict:
    score = compute_gap_score(district_id, amenity_overrides, population_multiplier)
    return get_model().evaluate(district_id, score)
