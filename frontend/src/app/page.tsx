"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BriefingPanel } from "@/components/BriefingPanel";
import { DistrictPanel } from "@/components/DistrictPanel";
import { Legend } from "@/components/Legend";
import type { LayerMode } from "@/components/MapView";
import {
  DEFAULT_SIM,
  SimulationControls,
  type SimState,
} from "@/components/SimulationControls";
import { getDistricts, getHeatmap, simulate } from "@/lib/api";
import { gapColor } from "@/lib/color";
import type {
  DistrictSummary,
  HeatPoint,
  ScoreResult,
} from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted">
      Loading map…
    </div>
  ),
});

type SidebarTab = "detail" | "rankings";

const LAYERS: { id: LayerMode; label: string }[] = [
  { id: "choropleth", label: "Choropleth" },
  { id: "heatmap", label: "Heatmap" },
  { id: "both", label: "Both" },
];

export default function Home() {
  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [heat, setHeat] = useState<HeatPoint[]>([]);
  const [layer, setLayer] = useState<LayerMode>("both");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<SidebarTab>("detail");

  const [simByDistrict, setSimByDistrict] = useState<Record<string, SimState>>(
    {}
  );
  const [resultByDistrict, setResultByDistrict] = useState<
    Record<string, ScoreResult>
  >({});
  const [simLoading, setSimLoading] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  // Initial data load
  useEffect(() => {
    (async () => {
      try {
        const [d, h] = await Promise.all([getDistricts(), getHeatmap()]);
        setDistricts(d.districts);
        setHeat(h.points);
      } catch (e) {
        setConnError(
          e instanceof Error ? e.message : "Cannot reach the API server."
        );
      }
    })();
  }, []);

  const selectedSim = selectedId
    ? simByDistrict[selectedId] ?? DEFAULT_SIM
    : DEFAULT_SIM;
  const selectedSimKey = JSON.stringify(selectedSim);

  // Live re-score the selected district (debounced) whenever its sim changes.
  const reqIdRef = useRef(0);
  useEffect(() => {
    if (!selectedId) return;
    const myReq = ++reqIdRef.current;
    setSimLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await simulate({
          district_id: selectedId,
          amenity_overrides: selectedSim.overrides,
          population_multiplier: selectedSim.populationMultiplier,
        });
        if (myReq === reqIdRef.current) {
          setResultByDistrict((prev) => ({ ...prev, [selectedId]: res }));
        }
      } catch {
        /* keep previous result on transient error */
      } finally {
        if (myReq === reqIdRef.current) setSimLoading(false);
      }
    }, 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedSimKey]);

  const scoresById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of districts) m[d.district_id] = d.gap_score;
    for (const [id, r] of Object.entries(resultByDistrict))
      m[id] = r.gap_score;
    return m;
  }, [districts, resultByDistrict]);

  const hypotheticalIds = useMemo(() => {
    const s = new Set<string>();
    for (const [id, r] of Object.entries(resultByDistrict))
      if (r.meta.is_hypothetical) s.add(id);
    return s;
  }, [resultByDistrict]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setTab("detail");
  }, []);

  const selectedDistrict = districts.find(
    (d) => d.district_id === selectedId
  );
  const selectedResult = selectedId ? resultByDistrict[selectedId] : null;

  const rankings = useMemo(
    () =>
      [...districts].sort(
        (a, b) =>
          (scoresById[b.district_id] ?? b.gap_score) -
          (scoresById[a.district_id] ?? a.gap_score)
      ),
    [districts, scoresById]
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-panel px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-base font-bold text-[#06243a]">
            E
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">
              Equilibrium
            </h1>
            <p className="text-[11px] leading-tight text-muted">
              Abu Dhabi demand-supply gap simulator
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border bg-panel-2 p-0.5 text-xs">
            {LAYERS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLayer(l.id)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  layer === l.id
                    ? "bg-accent text-[#06243a]"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Map */}
        <div className="relative min-w-0 flex-1">
          {connError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-sm font-medium text-red-300">
                Cannot reach the scoring API
              </p>
              <p className="max-w-md text-xs text-muted">
                {connError}. Make sure the FastAPI server is running on{" "}
                <code className="text-foreground/80">localhost:8000</code> (see
                README), or set{" "}
                <code className="text-foreground/80">NEXT_PUBLIC_API_URL</code>.
              </p>
            </div>
          ) : (
            <>
              <MapView
                districts={districts}
                scoresById={scoresById}
                hypotheticalIds={hypotheticalIds}
                heatPoints={heat}
                layer={layer}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
              <Legend layer={layer} />
            </>
          )}
        </div>

        {/* Sidebar */}
        <aside className="flex w-[400px] shrink-0 flex-col border-l border-border bg-panel">
          <div className="flex shrink-0 border-b border-border">
            {(["detail", "rankings"] as SidebarTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${
                  tab === t
                    ? "border-b-2 border-accent text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {tab === "detail" ? (
              <>
                <DistrictPanel
                  result={selectedResult ?? null}
                  name={selectedDistrict?.name ?? null}
                  loading={simLoading}
                />
                {selectedId && (
                  <>
                    <SimulationControls
                      state={selectedSim}
                      center={
                        selectedDistrict
                          ? {
                              lat: selectedDistrict.lat,
                              lon: selectedDistrict.lon,
                            }
                          : null
                      }
                      onChange={(next) =>
                        setSimByDistrict((prev) => ({
                          ...prev,
                          [selectedId]: next,
                        }))
                      }
                      disabled={simLoading && false}
                    />
                    <BriefingPanel
                      districtId={selectedId}
                      result={selectedResult ?? null}
                    />
                  </>
                )}
              </>
            ) : (
              <div className="p-3">
                <p className="mb-2 px-2 text-[11px] text-muted">
                  {districts.length} districts · sorted by gap score
                  {hypotheticalIds.size > 0 && " · ✦ = what-if applied"}
                </p>
                <ul className="space-y-1">
                  {rankings.map((d, i) => {
                    const score = scoresById[d.district_id] ?? d.gap_score;
                    const hypo = hypotheticalIds.has(d.district_id);
                    return (
                      <li key={d.district_id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(d.district_id)}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                            d.district_id === selectedId
                              ? "border-accent bg-panel-2"
                              : "border-transparent hover:bg-panel-2"
                          }`}
                        >
                          <span className="w-5 text-right font-mono text-xs text-muted">
                            {i + 1}
                          </span>
                          <span
                            className="h-7 w-1.5 shrink-0 rounded-full"
                            style={{ background: gapColor(score) }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {d.name}
                            {hypo && (
                              <span className="ml-1 text-amber-300">✦</span>
                            )}
                          </span>
                          <span
                            className="font-mono text-sm font-semibold tabular-nums"
                            style={{ color: gapColor(score) }}
                          >
                            {score.toFixed(0)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
