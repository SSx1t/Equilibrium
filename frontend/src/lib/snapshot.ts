import snapshotJson from "@/data/snapshot.json";
import type { DistrictSummary, HeatPoint } from "./types";

interface Snapshot {
  districts: { count: number; districts: DistrictSummary[] };
  heatmap: { count: number; points: HeatPoint[] };
}

const snapshot = snapshotJson as unknown as Snapshot;

// Baseline data bundled at build time (see scripts/build_snapshot.py). Used for
// instant first paint while the live API wakes from a cold start.
export const SNAPSHOT_DISTRICTS: DistrictSummary[] = snapshot.districts.districts;
export const SNAPSHOT_HEAT: HeatPoint[] = snapshot.heatmap.points;
