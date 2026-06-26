"use client";

import {
  BUCKETS,
  type AmenityOverride,
  type Bucket,
} from "@/lib/types";
import { HypotheticalBadge } from "./HypotheticalBadge";

export interface SimState {
  populationMultiplier: number;
  overrides: AmenityOverride[];
}

export const DEFAULT_SIM: SimState = {
  populationMultiplier: 1,
  overrides: [],
};

const BUCKET_LABEL: Record<Bucket, string> = {
  healthcare: "Healthcare",
  education: "Education",
  transit: "Transit",
  retail: "Retail",
  parks: "Parks",
};

function netDelta(overrides: AmenityOverride[], bucket: Bucket): number {
  return overrides.reduce((acc, o) => {
    if (o.type !== bucket) return acc;
    return acc + (o.action === "add" ? 1 : -1);
  }, 0);
}

export interface PlaceMode {
  type: Bucket;
  action: "add" | "remove";
}

export function SimulationControls({
  state,
  center,
  onChange,
  disabled,
  placeMode,
  onSetPlaceMode,
}: {
  state: SimState;
  center: { lat: number; lon: number } | null;
  onChange: (next: SimState) => void;
  disabled: boolean;
  placeMode: PlaceMode | null;
  onSetPlaceMode: (m: PlaceMode | null) => void;
}) {
  const isDirty =
    state.populationMultiplier !== 1 || state.overrides.length > 0;

  const addOverride = (bucket: Bucket, action: "add" | "remove") => {
    if (!center) return;
    onChange({
      ...state,
      overrides: [
        ...state.overrides,
        { lat: center.lat, lon: center.lon, type: bucket, action },
      ],
    });
  };

  const growthPct = Math.round((state.populationMultiplier - 1) * 100);

  return (
    <div className="space-y-4 border-t border-border p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          What-if simulation
        </h3>
        {isDirty && <HypotheticalBadge small />}
      </div>

      <p className="-mt-1 text-[11px] leading-snug text-muted">
        Hypothetical edits only — never saved to the data. The map and scores
        update instantly.
      </p>

      {/* Population growth slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground/90">Population growth</span>
          <span
            className={`font-mono ${
              growthPct !== 0 ? "text-amber-300" : "text-muted"
            }`}
          >
            {growthPct > 0 ? "+" : ""}
            {growthPct}%
          </span>
        </div>
        <input
          type="range"
          min={0.8}
          max={1.5}
          step={0.05}
          value={state.populationMultiplier}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...state,
              populationMultiplier: parseFloat(e.target.value),
            })
          }
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted">
          <span>−20%</span>
          <span>baseline</span>
          <span>+50%</span>
        </div>
      </div>

      {/* Amenity overrides */}
      <div className="space-y-2">
        <div className="text-xs text-foreground/90">Adjust amenities</div>
        {BUCKETS.map((b) => {
          const d = netDelta(state.overrides, b);
          return (
            <div key={b} className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground/80">
                {BUCKET_LABEL[b]}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={disabled || !center}
                  onClick={() => addOverride(b, "remove")}
                  className="h-6 w-6 rounded-md border border-border bg-panel-2 text-sm leading-none text-foreground/80 hover:bg-border disabled:opacity-40"
                  aria-label={`Remove ${b}`}
                >
                  −
                </button>
                <span
                  className={`w-8 text-center font-mono text-xs ${
                    d === 0 ? "text-muted" : "text-amber-300"
                  }`}
                >
                  {d > 0 ? "+" : ""}
                  {d}
                </span>
                <button
                  type="button"
                  disabled={disabled || !center}
                  onClick={() => addOverride(b, "add")}
                  className="h-6 w-6 rounded-md border border-border bg-panel-2 text-sm leading-none text-foreground/80 hover:bg-border disabled:opacity-40"
                  aria-label={`Add ${b}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Place precisely on the map (sub-district) */}
      <div className="space-y-2 rounded-lg border border-border bg-panel-2/50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/90">Place on map</span>
          {placeMode && (
            <button
              type="button"
              onClick={() => onSetPlaceMode(null)}
              className="text-[11px] text-muted hover:text-foreground"
            >
              cancel
            </button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-1">
          {BUCKETS.map((b) => {
            const active = placeMode?.type === b;
            return (
              <button
                key={b}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onSetPlaceMode(
                    active ? null : { type: b, action: placeMode?.action ?? "add" }
                  )
                }
                className={`rounded-md border px-1 py-1.5 text-[10px] font-medium capitalize transition-colors ${
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {b}
              </button>
            );
          })}
        </div>
        {placeMode && (
          <>
            <div className="flex rounded-md border border-border p-0.5 text-[11px]">
              {(["add", "remove"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => onSetPlaceMode({ ...placeMode, action: a })}
                  className={`flex-1 rounded py-1 font-medium capitalize ${
                    placeMode.action === a
                      ? "bg-accent text-[#06243a]"
                      : "text-muted"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-amber-300">
              Click anywhere on the map to {placeMode.action} a {placeMode.type}{" "}
              at that exact spot.
            </p>
          </>
        )}
      </div>

      {isDirty && (
        <button
          type="button"
          onClick={() => {
            onChange(DEFAULT_SIM);
            onSetPlaceMode(null);
          }}
          className="w-full rounded-lg border border-border bg-panel-2 py-2 text-xs font-medium text-foreground/80 hover:bg-border"
        >
          Reset to baseline
        </button>
      )}
    </div>
  );
}
