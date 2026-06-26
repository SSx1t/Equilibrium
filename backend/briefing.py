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
    "Write an investor briefing (<=200 words) with: (1) the opportunity - what the "
    "demand-supply gap implies for development/asset upside; (2) the risk - what the "
    "deficits and demand level imply; (3) if hypothetical edits (new amenities / "
    "population growth) are present, how they shift the investment case versus baseline. "
    "Frame around the actual numbers provided."
)


def generate_briefing(district_id: str, mode: str, current_score_state: dict[str, Any]) -> dict:
    mode = (mode or "planner").strip().lower()
    if mode not in ("planner", "investor"):
        raise BriefingError("mode must be 'planner' or 'investor'")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise BriefingError(
            "ANTHROPIC_API_KEY is not set. Add it to the environment (.env) to enable "
            "the Generate Briefing feature."
        )

    try:
        import anthropic
    except ImportError as e:  # pragma: no cover
        raise BriefingError("anthropic package not installed") from e

    system = PLANNER_SYSTEM if mode == "planner" else INVESTOR_SYSTEM
    task = PLANNER_TASK if mode == "planner" else INVESTOR_TASK
    digest = _summarise_state(district_id, current_score_state)

    user_msg = (
        f"{task}\n\n"
        f"=== CURRENT SCORE STATE (the only facts you may use) ===\n{digest}\n"
    )

    client = anthropic.Anthropic(api_key=api_key)
    try:
        resp = client.messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=config.ANTHROPIC_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception as e:  # surface a clean error to the API layer
        raise BriefingError(f"Anthropic API call failed: {e}") from e

    text = "".join(block.text for block in resp.content if getattr(block, "type", None) == "text")
    return {
        "district_id": district_id,
        "mode": mode,
        "briefing": text.strip(),
        "model": config.ANTHROPIC_MODEL,
        "is_hypothetical": bool(current_score_state.get("meta", {}).get("is_hypothetical")),
        "disclaimer": (
            "Generated narrative based on the supplied score state. Any amenity edits or "
            "population growth in this scenario are user-hypothetical, not recorded data."
        ),
    }
