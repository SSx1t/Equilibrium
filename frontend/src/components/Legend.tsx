"use client";

import type { LayerMode } from "./MapView";

export function Legend({ layer }: { layer: LayerMode }) {
  const showChoro = layer === "choropleth" || layer === "both";
  const showHeat = layer === "heatmap" || layer === "both";
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] space-y-3 rounded-xl border border-border bg-panel/90 p-3 text-xs backdrop-blur">
      {showChoro && (
        <div>
          <div className="mb-1 font-medium text-foreground/90">
            District gap score
          </div>
          <div
            className="h-2 w-40 rounded-full"
            style={{
              background:
                "linear-gradient(90deg,#22c55e,#84cc16,#eab308,#f97316,#ef4444)",
            }}
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>0 served</span>
            <span>100 gap</span>
          </div>
        </div>
      )}
      {showHeat && (
        <div>
          <div className="mb-1 font-medium text-foreground/90">
            Service pressure (sub-district)
          </div>
          <div
            className="h-2 w-40 rounded-full"
            style={{
              background:
                "linear-gradient(90deg,#1d4ed8,#06b6d4,#eab308,#f97316,#ef4444)",
            }}
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>low</span>
            <span>high</span>
          </div>
        </div>
      )}
    </div>
  );
}
