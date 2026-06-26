"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BriefingPanel } from "@/components/BriefingPanel";
import { DistrictPanel } from "@/components/DistrictPanel";
import { Header, type NavView } from "@/components/Header";
import { InvestmentPanel } from "@/components/InvestmentPanel";
import { Legend } from "@/components/Legend";
import { ReportsView } from "@/components/ReportsView";
import type { LayerMode, PlacedPin } from "@/components/MapView";
import {
  DEFAULT_SIM,
  type PlaceMode,
  SimulationControls,
  type SimState,
} from "@/components/SimulationControls";
import { useTheme } from "@/components/ThemeProvider";
import {
  getDistricts,
  getHeatmap,
  getInvestment,
  simulate,
  simulateHeatmap,
} from "@/lib/api";
import { gapColor, gapColorA } from "@/lib/color";
import type {
  AmenityOverride,
  BriefingMode,
  DistrictSummary,
  HeatPoint,
  InvestmentResult,
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

const LAYERS: { id: LayerMode; label: string }[] = [
  { id: "choropleth", label: "Gap Score" },
  { id: "heatmap", label: "Pressure Heatmap" },
  { id: "both", label: "Both" },
];

export default function Home() {
  const { theme } = useTheme();
  const [view, setView] = useState<NavView>("analysis");
  const [mode, setMode] = useState<BriefingMode>("planner");
  const [briefingSignal, setBriefingSignal] = useState(0);

  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [layer, setLayer] = useState<LayerMode>("choropleth");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [simByDistrict, setSimByDistrict] = useState<Record<string, SimState>>({});
  const [resultByDistrict, setResultByDistrict] = useState<
    Record<string, ScoreResult>
  >({});
  const [investByDistrict, setInvestByDistrict] = useState<
    Record<string, InvestmentResult>
  >({});
  const [simLoading, setSimLoading] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState<PlaceMode | null>(null);
  const [heat, setHeat] = useState<HeatPoint[]>([]);
  const [baseHeat, setBaseHeat] = useState<HeatPoint[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [d, h] = await Promise.all([getDistricts(), getHeatmap()]);
        setDistricts(d.districts);
        setHeat(h.points);
        setBaseHeat(h.points);
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

  const reqIdRef = useRef(0);
  useEffect(() => {
    if (!selectedId) return;
    const myReq = ++reqIdRef.current;
    setSimLoading(true);
    const body = {
      district_id: selectedId,
      amenity_overrides: selectedSim.overrides,
      population_multiplier: selectedSim.populationMultiplier,
    };
    const t = setTimeout(async () => {
      try {
        const [res, inv] = await Promise.all([
          simulate(body),
          getInvestment(body),
        ]);
        if (myReq === reqIdRef.current) {
          setResultByDistrict((prev) => ({ ...prev, [selectedId]: res }));
          setInvestByDistrict((prev) => ({ ...prev, [selectedId]: inv }));
        }
      } catch {
        /* keep previous */
      } finally {
        if (myReq === reqIdRef.current) setSimLoading(false);
      }
    }, 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedSimKey]);

  const allOverrides = useMemo<AmenityOverride[]>(() => {
    const out: AmenityOverride[] = [];
    for (const sim of Object.values(simByDistrict)) out.push(...sim.overrides);
    return out;
  }, [simByDistrict]);

  const pins = useMemo<PlacedPin[]>(() => {
    const out: PlacedPin[] = [];
    for (const [district, sim] of Object.entries(simByDistrict))
      for (const o of sim.overrides)
        out.push({ lat: o.lat, lon: o.lon, type: o.type, district, action: o.action });
    return out;
  }, [simByDistrict]);

  const overridesKey = JSON.stringify(allOverrides);
  useEffect(() => {
    if (allOverrides.length === 0) {
      setHeat(baseHeat);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const h = await simulateHeatmap(allOverrides);
        if (!cancelled) setHeat(h.points);
      } catch {
        /* keep current */
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overridesKey, baseHeat]);

  const nearestDistrict = useCallback(
    (lat: number, lon: number): DistrictSummary | null => {
      let best: DistrictSummary | null = null;
      let bestD = Infinity;
      for (const d of districts) {
        const dd = (d.lat - lat) ** 2 + (d.lon - lon) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = d;
        }
      }
      return best;
    },
    [districts]
  );

  const handleMapClick = useCallback(
    (lat: number, lon: number) => {
      if (!placeMode) return;
      const d = nearestDistrict(lat, lon);
      if (!d) return;
      const id = d.district_id;
      setSimByDistrict((prev) => {
        const cur = prev[id] ?? DEFAULT_SIM;
        return {
          ...prev,
          [id]: {
            ...cur,
            overrides: [
              ...cur.overrides,
              { lat, lon, type: placeMode.type, action: placeMode.action },
            ],
          },
        };
      });
      setSelectedId(id);
    },
    [placeMode, nearestDistrict]
  );

  const scoresById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of districts) m[d.district_id] = d.gap_score;
    for (const [id, r] of Object.entries(resultByDistrict)) m[id] = r.gap_score;
    return m;
  }, [districts, resultByDistrict]);

  const hypotheticalIds = useMemo(() => {
    const s = new Set<string>();
    for (const [id, r] of Object.entries(resultByDistrict))
      if (r.meta.is_hypothetical) s.add(id);
    return s;
  }, [resultByDistrict]);

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  const selectedDistrict = districts.find((d) => d.district_id === selectedId);
  const selectedResult = selectedId ? resultByDistrict[selectedId] : null;
  const selectedInvest = selectedId ? investByDistrict[selectedId] : null;

  const sortedDistricts = useMemo(
    () =>
      [...districts].sort(
        (a, b) =>
          (scoresById[b.district_id] ?? b.gap_score) -
          (scoresById[a.district_id] ?? a.gap_score)
      ),
    [districts, scoresById]
  );

  const liveGap = selectedResult?.gap_score ?? selectedDistrict?.gap_score ?? 0;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header
        view={view}
        onNav={setView}
        mode={mode}
        onMode={setMode}
        onGenerateBriefing={() => setBriefingSignal((s) => s + 1)}
        briefingDisabled={!selectedResult}
      />

      {view === "analysis" ? (
        <div className="flex min-h-0 flex-1">
          {/* Map */}
          <div className="relative min-w-0 flex-1">
            {connError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                <p className="text-sm font-medium text-bad">
                  Cannot reach the scoring API
                </p>
                <p className="max-w-md text-xs text-muted">
                  {connError}. Make sure the FastAPI server is running on{" "}
                  <code>localhost:8000</code>, or set{" "}
                  <code>NEXT_PUBLIC_API_URL</code>.
                </p>
              </div>
            ) : (
              <>
                {/* Layer toggle (top-right) */}
                <div className="absolute right-4 top-4 z-[1000] flex rounded-lg border border-border bg-panel/95 p-0.5 text-xs card-shadow backdrop-blur">
                  {LAYERS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLayer(l.id)}
                      className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                        layer === l.id
                          ? "bg-accent text-on-accent"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>

                <MapView
                  districts={districts}
                  scoresById={scoresById}
                  hypotheticalIds={hypotheticalIds}
                  heatPoints={heat}
                  layer={layer}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  placeActive={placeMode !== null}
                  onMapClick={handleMapClick}
                  pins={pins}
                  theme={theme}
                />
                <Legend layer={layer} />
                {placeMode && (
                  <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-full border border-accent/50 bg-panel/95 px-4 py-1.5 text-xs font-medium text-accent card-shadow backdrop-blur">
                    Click the map to {placeMode.action} a {placeMode.type} (what-if)
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <aside className="flex w-[400px] shrink-0 flex-col border-l border-border bg-panel">
            {/* District header */}
            <div className="shrink-0 border-b border-border p-4">
              <div className="mb-2 flex items-center gap-2">
                <select
                  value={selectedId ?? ""}
                  onChange={(e) => setSelectedId(e.target.value || null)}
                  className="flex-1 rounded-lg border border-border bg-panel-2 px-2.5 py-1.5 text-sm font-medium text-foreground outline-none focus:border-accent"
                >
                  <option value="">Select a district…</option>
                  {sortedDistricts.map((d) => (
                    <option key={d.district_id} value={d.district_id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedDistrict ? (
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold leading-tight tracking-tight">
                      {selectedDistrict.name}
                    </h2>
                    <p className="text-xs text-muted">
                      {selectedDistrict.area_type} ·{" "}
                      {selectedResult?.meta.population_simulated.toLocaleString() ??
                        selectedDistrict.population.toLocaleString()}{" "}
                      residents
                      {selectedResult &&
                        selectedResult.meta.population_multiplier !== 1 && (
                          <span className="text-warn">
                            {" "}
                            (×{selectedResult.meta.population_multiplier})
                          </span>
                        )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
                      style={{
                        background: gapColorA(liveGap, 0.16),
                        color: gapColor(liveGap),
                      }}
                    >
                      Gap {liveGap.toFixed(0)}/100
                    </span>
                    {simLoading && (
                      <span className="flex items-center gap-1 text-[10px] text-accent">
                        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
                        updating…
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Pick a district above or click the map.
                </p>
              )}
            </div>

            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              {!selectedId ? (
                <div className="p-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Highest gap districts
                  </p>
                  <ul className="space-y-1">
                    {sortedDistricts.slice(0, 8).map((d, i) => {
                      const score = scoresById[d.district_id] ?? d.gap_score;
                      return (
                        <li key={d.district_id}>
                          <button
                            type="button"
                            onClick={() => handleSelect(d.district_id)}
                            className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left hover:bg-panel-2"
                          >
                            <span className="w-4 text-right font-mono text-xs text-muted">
                              {i + 1}
                            </span>
                            <span
                              className="h-6 w-1.5 rounded-full"
                              style={{ background: gapColor(score) }}
                            />
                            <span className="flex-1 truncate text-sm">
                              {d.name}
                            </span>
                            <span
                              className="font-mono text-sm font-semibold"
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
              ) : (
                <>
                  {selectedResult ? (
                    mode === "planner" ? (
                      <DistrictPanel result={selectedResult} />
                    ) : (
                      <InvestmentPanel data={selectedInvest ?? null} loading={simLoading} />
                    )
                  ) : (
                    <p className="p-4 text-sm text-muted">Scoring…</p>
                  )}

                  <SimulationControls
                    state={selectedSim}
                    center={
                      selectedDistrict
                        ? { lat: selectedDistrict.lat, lon: selectedDistrict.lon }
                        : null
                    }
                    onChange={(next) =>
                      setSimByDistrict((prev) => ({ ...prev, [selectedId]: next }))
                    }
                    disabled={false}
                    placeMode={placeMode}
                    onSetPlaceMode={setPlaceMode}
                  />

                  <BriefingPanel
                    districtId={selectedId}
                    result={selectedResult ?? null}
                    investment={selectedInvest ?? null}
                    mode={mode}
                    triggerSignal={briefingSignal}
                  />
                </>
              )}
            </div>
          </aside>
        </div>
      ) : view === "simulations" ? (
        <SimulationsView
          districts={sortedDistricts}
          resultByDistrict={resultByDistrict}
          investByDistrict={investByDistrict}
          onOpen={(id) => {
            setSelectedId(id);
            setView("analysis");
          }}
        />
      ) : (
        <ReportsView
          districts={sortedDistricts}
          simByDistrict={simByDistrict}
          initialDistrictId={selectedId}
        />
      )}
    </div>
  );
}

function SimulationsView({
  districts,
  resultByDistrict,
  investByDistrict,
  onOpen,
}: {
  districts: DistrictSummary[];
  resultByDistrict: Record<string, ScoreResult>;
  investByDistrict: Record<string, InvestmentResult>;
  onOpen: (id: string) => void;
}) {
  const scenarios = districts.filter(
    (d) => resultByDistrict[d.district_id]?.meta.is_hypothetical
  );
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight">Simulations</h1>
        <p className="mt-1 text-sm text-muted">
          Your active what-if scenarios. Every figure is hypothetical and traces
          to the live scoring engine.
        </p>

        {scenarios.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-panel p-10 text-center">
            <p className="text-sm font-medium">No active scenarios yet</p>
            <p className="mt-1 text-xs text-muted">
              Go to Analysis, pick a district, then add amenities or adjust
              population growth to model an intervention.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {scenarios.map((d) => {
              const r = resultByDistrict[d.district_id];
              const inv = investByDistrict[d.district_id];
              const baseGap = d.gap_score;
              const gapDelta = r.gap_score - baseGap;
              return (
                <div
                  key={d.district_id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-panel p-4 card-shadow"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{d.name}</span>
                      <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn">
                        WHAT-IF
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Pop ×{r.meta.population_multiplier} ·{" "}
                      {Object.entries(r.meta.amenity_override_delta)
                        .filter(([, v]) => v)
                        .map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k}`)
                        .join(", ") || "no amenity edits"}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">
                        Gap Δ
                      </div>
                      <div
                        className="font-mono text-sm font-semibold"
                        style={{ color: gapColor(gapDelta > 0 ? 90 : 10) }}
                      >
                        {gapDelta > 0 ? "+" : ""}
                        {gapDelta.toFixed(1)}
                      </div>
                    </div>
                    {inv && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted">
                          Invest Δ
                        </div>
                        <div
                          className={`font-mono text-sm font-semibold ${
                            inv.scenario_delta >= 0 ? "text-good" : "text-bad"
                          }`}
                        >
                          {inv.scenario_delta > 0 ? "+" : ""}
                          {inv.scenario_delta}
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpen(d.district_id)}
                      className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                    >
                      Open
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

