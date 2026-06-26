"""Step 2 test - baseline vs a fake amenity add, plus a population-growth case.
Also times the function to confirm it runs well under 1 second."""
import json
import time
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.scoring import compute_gap_score  # noqa: E402

DISTRICT = "Al Maryah Island"  # low healthcare/education per-capita -> visible gap


def show(label, res):
    print(f"\n--- {label} ---")
    print("gap_score   :", res["gap_score"])
    print("demand_index:", res["demand_index"])
    print("supply (% adequacy):", json.dumps(res["supply_breakdown"]))
    print("top deductions:")
    for d in res["deductions"][:3]:
        print(f"   {d['category']:<11} {d['points']:>6} pts | {d['reason']}")
    print("hypothetical:", res["meta"]["is_hypothetical"])


# 1) baseline
base = compute_gap_score(DISTRICT)
show("BASELINE (no overrides, multiplier 1.0)", base)

# 2) add a fake healthcare amenity -> gap should DROP (better supply)
add_health = compute_gap_score(
    DISTRICT,
    amenity_overrides=[{"lat": 24.50, "lon": 54.39, "type": "healthcare", "action": "add"}],
)
show("ADD 1 fake healthcare amenity", add_health)

# 3) +20% population -> gap should RISE (same supply, more people)
growth = compute_gap_score(DISTRICT, population_multiplier=1.2)
show("POPULATION +20% (multiplier 1.2)", growth)

# 4) remove an education amenity -> gap should RISE
rm_edu = compute_gap_score(
    DISTRICT,
    amenity_overrides=[{"lat": 24.50, "lon": 54.39, "type": "education", "action": "remove"}],
)
show("REMOVE 1 education amenity", rm_edu)

# --- assertions ---
assert add_health["gap_score"] <= base["gap_score"], "Adding healthcare should not raise the gap"
assert growth["gap_score"] >= base["gap_score"], "Population growth should not lower the gap"
print("\nSANITY CHECKS PASSED:",
      f"add_health({add_health['gap_score']}) <= base({base['gap_score']}) <= growth({growth['gap_score']})")

# --- timing: average over many calls ---
N = 2000
t0 = time.perf_counter()
for _ in range(N):
    compute_gap_score(
        DISTRICT,
        amenity_overrides=[{"lat": 24.5, "lon": 54.39, "type": "healthcare", "action": "add"}],
        population_multiplier=1.1,
    )
elapsed = time.perf_counter() - t0
print(f"\nTIMING: {N} calls in {elapsed*1000:.1f} ms => {elapsed/N*1000:.4f} ms/call "
      f"(requirement: well under 1000 ms/call)")
