"""Build data/heatmap_points.json (Step 3 output) and print summary stats."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.heatmap import compute_heatmap_points, heatmap_meta  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "data" / "heatmap_points.json"

points = compute_heatmap_points()
meta = heatmap_meta()

OUT.write_text(json.dumps(points))
weights = [p["weight"] for p in points]
print("APPROACH:", json.dumps(meta, indent=2))
print(f"\nWrote {len(points):,} pressure points -> {OUT}")
if weights:
    print(f"weight range: min={min(weights):.3f} max={max(weights):.3f} "
          f"mean={sum(weights)/len(weights):.3f}")
print("\nfirst 5 points:")
for p in points[:5]:
    print(" ", p)
