"""
/briefing helper - the ONLY place the Anthropic API is touched. Never called by
the scoring, /districts, /heatmap, or /simulate paths. Triggered exclusively by
an explicit POST /briefing (the "Generate Briefing" button).

Both prompts are fed the caller's actual current_score_state numbers so the LLM
narrates real figures rather than inventing them, and is told explicitly which
parts are user-hypothetical.
"""
from __future__ import annotations

import json
import os
from typing import Any

from . import config


class BriefingError(RuntimeError):
    pass


def _summarise_state(district_id: str, state: dict[str, Any]) -> str:
    """Compact, factual digest of the score state for the prompt."""
    supply = state.get("supply_breakdown", {})
    deductions = state.get("deductions", [])
    meta = state.get("meta", {})
    lines = [
        f"District: {district_id}",
        f"Gap score (0-100, higher = larger unmet-demand gap): {state.get('gap_score')}",
        f"Demand index (0-100): {state.get('demand_index')}",
        "Supply adequacy by category (% of benchmark met):",
    ]
    for cat, pct in supply.items():
        lines.append(f"  - {cat}: {pct}% adequate")
    lines.append("Largest gap contributors:")
    for d in deductions[:5]:
        lines.append(f"  - {d.get('category')}: {d.get('points')} gap pts | {d.get('reason')}")
    if meta:
        lines.append(
            f"Population baseline: {meta.get('population_baseline'):,} | "
            f"simulated: {meta.get('population_simulated'):,} "
            f"(x{meta.get('population_multiplier')})"
        )
        delta = meta.get("amenity_override_delta", {})
        nonzero = {k: v for k, v in delta.items() if v}
        if nonzero:
            lines.append(f"User-hypothetical amenity edits applied: {json.dumps(nonzero)}")
        lines.append(f"Hypothetical scenario: {meta.get('is_hypothetical')} - {meta.get('hypothetical_note')}")

    inv = state.get("investment")
    if inv:
        ml = inv.get("ml", {})
        lines.append("--- ML investment model (RandomForest price model + score layer) ---")
        lines.append(
            f"Investment score: {inv.get('investment_score')}/100 ({inv.get('rating')}); "
            f"opportunity: {inv.get('opportunity_score')}; risk: {inv.get('risk_score')}; "
            f"scenario shift vs baseline: {inv.get('scenario_delta')} pts"
        )
        lines.append(
            f"ML expected price/sqm: AED {ml.get('expected_price_per_sqm_aed'):,}; "
            f"gross yield: {ml.get('gross_yield_pct')}%; "
            f"expected annual rent/sqm: AED {ml.get('expected_annual_rent_per_sqm_aed'):,}; "
            f"payback: {ml.get('payback_years')} yrs "
            f"(model R2={ml.get('model_metrics',{}).get('r2')})"
        )
        rm = inv.get("real_market")
        if rm:
            lines.append(
                f"Real market check ({rm.get('n_real_sale_listings')} live listings): "
                f"real median AED {rm.get('real_median_price_per_sqm'):,}/sqm; "
                f"model is {rm.get('model_vs_real_pct')}% vs real ({rm.get('verdict')})."
            )
    return "\n".join(lines)


PLANNER_SYSTEM = (
    "You are an urban planning advisor for Abu Dhabi municipal planners. You write "
    "concise, decision-ready briefings. Use ONLY the numbers provided; never invent "
    "statistics. Where the scenario includes user-hypothetical edits (added/removed "
    "amenities or population growth), explicitly label them as hypothetical, not "
    "recorded fact."
)

INVESTOR_SYSTEM = (
    "You are a real-estate investment analyst covering Abu Dhabi districts. You write "
    "concise, decision-ready briefings framed as opportunity vs risk. Use ONLY the "
    "numbers provided; never invent statistics. Where the scenario includes "
    "user-hypothetical edits (added/removed amenities or population growth), explicitly "
    "label them as hypothetical and explain how they shift the investment case."
)

PLANNER_TASK = (
    "Write a planner briefing (<=200 words) with: (1) the headline service deficit and "
    "which categories drive it, citing the actual per-1,000 figures; (2) one or two "
    "concrete recommended actions (what to add, where it would help most); (3) the "
    "expected effect on the gap score. If hypothetical edits are present, state how they "
    "changed the picture."
)

INVESTOR_TASK = (
    "Write an investor briefing (<=200 words) grounded in the ML investment model "
    "numbers provided (investment score, opportunity, risk, ML expected price/sqm, "
    "yield, payback, and the real-market check). Cover: (1) the opportunity - what the "
    "demand-supply gap and value-add upside imply; (2) the risk - what the deficits, "
    "demand and service-strain imply; (3) how any hypothetical edits (new amenities / "
    "population growth) shift the investment case versus baseline, citing the "
    "scenario-shift figure. Note when the ML valuation diverges from the real market."
)


def _gemini_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def _select_provider() -> str | None:
    """Resolve which LLM provider to use given env keys and LLM_PROVIDER."""
    forced = os.environ.get("LLM_PROVIDER", config.LLM_PROVIDER).strip().lower()
    has_gemini = bool(_gemini_key())
    has_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY"))
    if forced == "gemini":
        return "gemini" if has_gemini else None
    if forced == "anthropic":
        return "anthropic" if has_anthropic else None
    # auto: prefer Gemini (free tier), then Anthropic
    if has_gemini:
        return "gemini"
    if has_anthropic:
        return "anthropic"
    return None


def _call_anthropic(system: str, user_msg: str) -> str:
    try:
        import anthropic
    except ImportError as e:  # pragma: no cover
        raise BriefingError("anthropic package not installed") from e
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=config.ANTHROPIC_MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )
    return "".join(
        block.text for block in resp.content
        if getattr(block, "type", None) == "text"
    ).strip()


def _call_gemini(system: str, user_msg: str) -> str:
    """Call the Gemini generateContent REST API (stdlib only, no extra dep).
    Thinking is disabled for fast, deterministic briefings."""
    import json as _json
    import urllib.request

    key = _gemini_key()
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{config.GEMINI_MODEL}:generateContent"
    )
    payload = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"parts": [{"text": user_msg}]}],
        "generationConfig": {
            "maxOutputTokens": config.GEMINI_MAX_TOKENS,
            "temperature": 0.7,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    req = urllib.request.Request(
        url,
        data=_json.dumps(payload).encode(),
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        data = _json.loads(r.read())
    candidates = data.get("candidates", [])
    if not candidates:
        raise BriefingError(f"Gemini returned no candidates: {data}")
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise BriefingError(f"Gemini returned empty text (finishReason="
                            f"{candidates[0].get('finishReason')})")
    return text


def generate_briefing(district_id: str, mode: str, current_score_state: dict[str, Any]) -> dict:
    mode = (mode or "planner").strip().lower()
    if mode not in ("planner", "investor"):
        raise BriefingError("mode must be 'planner' or 'investor'")

    provider = _select_provider()
    if provider is None:
        raise BriefingError(
            "No LLM key set. Add GEMINI_API_KEY (free tier) or ANTHROPIC_API_KEY "
            "to the environment (.env) to enable the Generate Briefing feature."
        )

    system = PLANNER_SYSTEM if mode == "planner" else INVESTOR_SYSTEM
    task = PLANNER_TASK if mode == "planner" else INVESTOR_TASK
    digest = _summarise_state(district_id, current_score_state)

    user_msg = (
        f"{task}\n\n"
        f"=== CURRENT SCORE STATE (the only facts you may use) ===\n{digest}\n"
    )

    try:
        if provider == "gemini":
            text = _call_gemini(system, user_msg)
            model = config.GEMINI_MODEL
        else:
            text = _call_anthropic(system, user_msg)
            model = config.ANTHROPIC_MODEL
        source = provider
    except Exception as e:  # noqa: BLE001
        # Graceful fallback so the demo never dead-ends (e.g. no API credits).
        text = _template_briefing(district_id, mode, current_score_state)
        source = "template_fallback"
        model = f"rule-based (AI unavailable: {e.__class__.__name__})"

    return {
        "district_id": district_id,
        "mode": mode,
        "briefing": text.strip(),
        "model": model,
        "source": source,
        "is_hypothetical": bool(current_score_state.get("meta", {}).get("is_hypothetical")),
        "disclaimer": (
            "Generated narrative based on the supplied score state. Any amenity edits or "
            "population growth in this scenario are user-hypothetical, not recorded data."
            + (
                " NOTE: the Anthropic API was unavailable, so this is a rule-based "
                "summary of the same numbers, not an LLM generation."
                if source == "template_fallback"
                else ""
            )
        ),
    }


def _template_briefing(district_id: str, mode: str, state: dict[str, Any]) -> str:
    """Deterministic, numbers-only briefing used when the LLM is unavailable."""
    gap = state.get("gap_score")
    demand = state.get("demand_index")
    deductions = state.get("deductions", [])
    top = deductions[0] if deductions else None
    top2 = deductions[1] if len(deductions) > 1 else None
    inv = state.get("investment") or {}
    ml = inv.get("ml", {})
    hypo = state.get("meta", {}).get("is_hypothetical")
    hypo_line = (
        " This scenario includes user-hypothetical edits (not recorded data)."
        if hypo
        else ""
    )
    drivers = ", ".join(
        f"{d.get('category')} ({d.get('points')} pts)" for d in deductions[:3]
    )
    if mode == "planner":
        rec = (
            f"Prioritise {top.get('category')} provision"
            + (f", then {top2.get('category')}" if top2 else "")
            + "."
            if top
            else "Maintain current service levels."
        )
        return (
            f"{district_id} — Planner briefing (rule-based).\n\n"
            f"Gap score {gap}/100 with demand index {demand}. The largest service "
            f"deficits are: {drivers}. {top.get('reason','') if top else ''}\n\n"
            f"Recommended action: {rec} Adding facilities in the weakest categories "
            f"is the fastest way to lower the gap score.{hypo_line}"
        )
    return (
        f"{district_id} — Investor briefing (rule-based).\n\n"
        f"Investment score {inv.get('investment_score')}/100 ({inv.get('rating')}), "
        f"opportunity {inv.get('opportunity_score')}, risk {inv.get('risk_score')}. "
        f"ML expected price AED {ml.get('expected_price_per_sqm_aed')}/sqm at "
        f"{ml.get('gross_yield_pct')}% gross yield "
        f"(~{ml.get('payback_years')}y payback). Gap score {gap} signals "
        f"{'strong latent demand and value-add upside' if (gap or 0) > 60 else 'a relatively well-served, stable market'}.\n\n"
        f"Opportunity vs risk: closing the {top.get('category') if top else 'service'} "
        f"gap would lift desirability; the main risk is service strain if population "
        f"outpaces provision. Scenario shift vs baseline: {inv.get('scenario_delta')} pts.{hypo_line}"
    )
