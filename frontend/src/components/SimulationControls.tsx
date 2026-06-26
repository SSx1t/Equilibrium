"use client";

import { BUCKETS, type AmenityOverride, type Bucket } from "@/lib/types";

export interface SimState {
  populationMultiplier: number;
  overrides: AmenityOverride[];
}

export const DEFAULT_SIM: SimState = {
  populationMultiplier: 1,
  overrides: [],
};

export interface PlaceMode {
  type: Bucket;
  action: "add" | "remove";
}

const BUCKET_LABEL: Record<Bucket, string> = {
  healthcare: "Healthcare",
  education: "Education",
  transit: "Transit",
  retail: "Retail",
  parks: "Parks",
};

function netDelta(overrides: AmenityOverride[], bucket: Bucket): number {
  return overrides.reduce(
    (acc, o) => (o.type !== bucket ? acc : acc + (o.action === "add" ? 1 : -1)),
    0
  );
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
  const isDirty = state.populationMultiplier !== 1 || state.overrides.length > 0;
  const growthPct = Math.round((state.populationMultiplier - 1) * 100);

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

  return (
    <div className="m-4 space-y-4 rounded-2xl border border-border bg-panel-2 p-4 text-foreground">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-accent">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
            </svg>
          </span>
          <span className="text-sm font-semibold">Simulation</span>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">
          Experimental
        </span>
      </div>
      <p className="-mt-2 text-[11px] text-muted">
        Hypothetical modelling, not real-time data.
      </p>

      {/* Modify amenities — quick (district centre) */}
      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Modify amenities
        </div>
        {BUCKETS.map((b) => {
          const d = netDelta(state.overrides, b);
          return (
            <div key={b} className="flex items-center justify-between">
              <span className="text-xs text-foreground/85">{BUCKET_LABEL[b]}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={disabled || !center}
                  onClick={() => addOverride(b, "remove")}
                  className="h-6 w-6 rounded-md border border-border bg-panel text-sm leading-none text-foreground/80 hover:bg-border disabled:opacity-40"
                  aria-label={`Remove ${b}`}
                >
                  −
                </button>
                <span
                  className={`w-7 text-center font-mono text-xs ${
                    d === 0 ? "text-muted" : "text-accent"
                  }`}
                >
                  {d > 0 ? "+" : ""}
                  {d}
                </span>
                <button
                  type="button"
                  disabled={disabled || !center}
                  onClick={() => addOverride(b, "add")}
                  className="h-6 w-6 rounded-md border border-border bg-panel text-sm leading-none text-foreground/80 hover:bg-border disabled:opacity-40"
                  aria-label={`Add ${b}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Place precisely on the map */}
      <div className="space-y-2 rounded-xl border border-border bg-panel p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/85">Add pin on map</span>
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
                      ? "bg-accent text-on-accent"
                      : "text-muted"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-accent">
              Click the map to {placeMode.action} a {placeMode.type} at that spot.
            </p>
          </>
        )}
      </div>

      {/* Population growth */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground/85">Population growth</span>
          <span
            className={`font-mono ${
              growthPct !== 0 ? "text-accent" : "text-muted"
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
            onChange({ ...state, populationMultiplier: parseFloat(e.target.value) })
          }
          className="w-full"
        />
      </div>

      {isDirty && (
        <button
          type="button"
          onClick={() => {
            onChange(DEFAULT_SIM);
            onSetPlaceMode(null);
          }}
          className="w-full rounded-lg border border-border bg-panel py-2 text-xs font-medium text-foreground/80 hover:bg-border"
        >
          Reset to baseline
        </button>
      )}
    </div>
  );
}
