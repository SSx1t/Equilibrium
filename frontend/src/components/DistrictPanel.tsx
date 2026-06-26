"use client";

import { gapColor, gapLabel } from "@/lib/color";
import { BUCKETS, type Bucket, type ScoreResult } from "@/lib/types";
import { HypotheticalBadge } from "./HypotheticalBadge";

const BUCKET_LABEL: Record<Bucket, string> = {
  healthcare: "Healthcare",
  education: "Education",
  transit: "Transit",
  retail: "Retail",
  parks: "Parks",
};

function SupplyBar({
  bucket,
  adequacy,
  delta,
}: {
  bucket: Bucket;
  adequacy: number;
  delta: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-foreground/90">
          {BUCKET_LABEL[bucket]}
          {delta !== 0 && (
            <span className="ml-1.5 text-amber-300">
              ({delta > 0 ? "+" : ""}
              {delta})
            </span>
          )}
        </span>
        <span className="font-mono text-muted">{adequacy.toFixed(0)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.max(2, Math.min(100, adequacy))}%`,
            background: gapColor(100 - adequacy),
          }}
        />
      </div>
    </div>
  );
}

export function DistrictPanel({
  result,
  name,
  loading,
}: {
  result: ScoreResult | null;
  name: string | null;
  loading: boolean;
}) {
  if (!name) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
        Select a district on the map to see its demand-supply gap, supply
        breakdown, and what-if simulation.
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-5 text-sm text-muted">
        {loading ? "Scoring…" : "No data."}
      </div>
    );
  }

  const { gap_score, demand_index, supply_breakdown, deductions, meta } =
    result;
  const isHypo = meta.is_hypothetical;

  return (
    <div className="space-y-5 p-5">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{name}</h2>
          {isHypo && <HypotheticalBadge />}
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {meta.population_simulated.toLocaleString()} residents
          {meta.population_multiplier !== 1 && (
            <span className="text-amber-300">
              {" "}
              (×{meta.population_multiplier} growth)
            </span>
          )}
        </div>
      </div>

      {/* Gap score hero */}
      <div className="flex items-stretch gap-3">
        <div
          className="flex flex-1 flex-col justify-center rounded-xl border border-border p-4"
          style={{ background: `${gapColor(gap_score)}1a` }}
        >
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Gap Score
          </div>
          <div
            className="text-4xl font-bold tabular-nums"
            style={{ color: gapColor(gap_score) }}
          >
            {gap_score.toFixed(1)}
          </div>
          <div className="text-xs font-medium text-foreground/80">
            {gapLabel(gap_score)}
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center rounded-xl border border-border bg-panel-2 p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Demand Index
          </div>
          <div className="text-4xl font-bold tabular-nums text-accent">
            {demand_index.toFixed(0)}
          </div>
          <div className="text-xs text-muted">intensity ×{meta.demand_intensity}</div>
        </div>
      </div>

      {/* Supply adequacy */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Supply adequacy (% of benchmark)
        </h3>
        <div className="space-y-2.5">
          {BUCKETS.map((b) => (
            <SupplyBar
              key={b}
              bucket={b}
              adequacy={supply_breakdown[b]}
              delta={meta.amenity_override_delta[b]}
            />
          ))}
        </div>
      </div>

      {/* Deductions */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Gap drivers
        </h3>
        <div className="space-y-2">
          {deductions.map((d) => (
            <div
              key={d.category}
              className="rounded-lg border border-border bg-panel-2 p-2.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize">{d.category}</span>
                <span className="font-mono text-foreground/70">
                  {d.points.toFixed(1)} pts
                </span>
              </div>
              <p className="mt-1 leading-snug text-muted">{d.reason}</p>
            </div>
          ))}
        </div>
      </div>

      {isHypo && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] leading-snug text-amber-200/90">
          {meta.hypothetical_note}
        </p>
      )}
    </div>
  );
}
