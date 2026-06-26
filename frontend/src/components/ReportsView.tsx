"use client";

import { useCallback, useEffect, useState } from "react";
import { getBriefing, getInvestment, simulate } from "@/lib/api";
import { gapColor } from "@/lib/color";
import { downloadReportPdf } from "@/lib/report";
import {
  BUCKETS,
  type DistrictSummary,
  type InvestmentResult,
  type ScoreResult,
} from "@/lib/types";
import type { SimState } from "./SimulationControls";
import { Markdown } from "./Markdown";

type ReportType = "planner" | "investor";

export function ReportsView({
  districts,
  simByDistrict,
  initialDistrictId,
}: {
  districts: DistrictSummary[];
  simByDistrict: Record<string, SimState>;
  initialDistrictId: string | null;
}) {
  const [districtId, setDistrictId] = useState<string | null>(
    initialDistrictId ?? districts[0]?.district_id ?? null
  );
  const [type, setType] = useState<ReportType>("planner");
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [investment, setInvestment] = useState<InvestmentResult | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const district = districts.find((d) => d.district_id === districtId) ?? null;

  const load = useCallback(async () => {
    if (!districtId) return;
    setLoading(true);
    setError(null);
    setNarrative(null);
    const sim = simByDistrict[districtId];
    const body = {
      district_id: districtId,
      amenity_overrides: sim?.overrides ?? [],
      population_multiplier: sim?.populationMultiplier ?? 1,
    };
    try {
      const [s, inv] = await Promise.all([simulate(body), getInvestment(body)]);
      setScore(s);
      setInvestment(inv);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report data.");
    } finally {
      setLoading(false);
    }
  }, [districtId, simByDistrict]);

  useEffect(() => {
    load();
  }, [load]);

  const generateNarrative = async () => {
    if (!districtId || !score) return;
    setAiLoading(true);
    try {
      const res = await getBriefing(districtId, type, {
        ...score,
        investment: investment ?? undefined,
      } as ScoreResult);
      setNarrative(res.briefing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI narrative failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const download = () => {
    if (!district || !score) return;
    downloadReportPdf({
      districtName: district.name,
      areaType: district.area_type,
      type,
      score,
      investment,
      narrative,
      generatedAt: new Date(),
    });
  };

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-bold tracking-tight">Reports &amp; Briefings</h1>
        <p className="mt-1 text-sm text-muted">
          Generate a professional, downloadable report. Planner and investor
          reports draw from the same live engine; pick the type below.
        </p>

        {/* Controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-panel p-4 card-shadow">
          <div className="flex flex-col">
            <label className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              District
            </label>
            <select
              value={districtId ?? ""}
              onChange={(e) => setDistrictId(e.target.value || null)}
              className="rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
            >
              {districts.map((d) => (
                <option key={d.district_id} value={d.district_id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Report type
            </label>
            <div className="flex rounded-lg border border-border bg-panel-2 p-0.5 text-sm">
              {(["planner", "investor"] as ReportType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-md px-3 py-1 font-medium capitalize transition-colors ${
                    type === t
                      ? "bg-accent text-on-accent"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-end gap-2 self-stretch">
            <button
              type="button"
              onClick={generateNarrative}
              disabled={!score || aiLoading}
              className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-border disabled:opacity-40"
            >
              {aiLoading ? "Writing…" : narrative ? "Regenerate AI" : "Add AI narrative"}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!score}
              className="flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download PDF
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
            {error}
          </div>
        )}

        {/* Preview document */}
        {loading || !score ? (
          <div className="mt-6 rounded-2xl border border-border bg-panel p-10 text-center text-sm text-muted card-shadow">
            {loading ? "Preparing report…" : "Select a district."}
          </div>
        ) : (
          <ReportPreview
            district={district}
            type={type}
            score={score}
            investment={investment}
            narrative={narrative}
          />
        )}
      </div>
    </div>
  );
}

function ReportPreview({
  district,
  type,
  score,
  investment,
  narrative,
}: {
  district: DistrictSummary | null;
  type: ReportType;
  score: ScoreResult;
  investment: InvestmentResult | null;
  narrative: string | null;
}) {
  if (!district) return null;
  const m = score.meta;
  const metrics =
    type === "investor" && investment
      ? [
          { label: "Investment Score", value: `${investment.investment_score}`, note: investment.rating },
          { label: "Opportunity", value: `${investment.opportunity_score}`, note: "upside" },
          { label: "Risk", value: `${investment.risk_score}`, note: "strain" },
        ]
      : [
          { label: "Gap Score", value: score.gap_score.toFixed(0), note: "/ 100" },
          { label: "Demand Index", value: score.demand_index.toFixed(0), note: "/ 100" },
          {
            label: "Top deficit",
            value: (score.deductions[0]?.category ?? "—").replace(/^\w/, (c) => c.toUpperCase()),
            note: `${score.deductions[0]?.points.toFixed(1) ?? 0} pts`,
          },
        ];

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-panel card-shadow">
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted">
          <span>{type} report</span>
          <span>{new Date().toLocaleDateString()}</span>
        </div>
        <h2 className="mt-2 text-xl font-bold">{district.name}</h2>
        <p className="text-xs text-muted">
          {district.area_type} · {m.population_simulated.toLocaleString()} residents ·{" "}
          {type === "investor" ? "Investment outlook" : "Service-gap assessment"}
        </p>
        {m.is_hypothetical && (
          <p className="mt-2 inline-block rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] font-medium text-warn">
            WHAT-IF scenario · population ×{m.population_multiplier}
            {Object.entries(m.amenity_override_delta)
              .filter(([, v]) => v)
              .map(([k, v]) => ` · ${v > 0 ? "+" : ""}${v} ${k}`)
              .join("")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 p-6">
        {metrics.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-panel-2 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted">{c.label}</div>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-[11px] text-muted">{c.note}</div>
          </div>
        ))}
      </div>

      <div className="space-y-5 px-6 pb-6">
        {type === "investor" && investment ? (
          <>
            <Section title="ML valuation">
              <KV k="Expected price / sqm" v={`AED ${investment.ml.expected_price_per_sqm_aed.toLocaleString()}`} />
              <KV k="Gross yield" v={`${investment.ml.gross_yield_pct}%`} />
              <KV k="Expected annual rent / sqm" v={`AED ${investment.ml.expected_annual_rent_per_sqm_aed.toLocaleString()}`} />
              <KV k="Payback" v={`${investment.ml.payback_years ?? "—"} years`} />
              <KV k="Model" v={`${investment.ml.model_metrics.model} · R²=${investment.ml.model_metrics.r2}`} />
            </Section>
            {investment.real_market && (
              <Section title="Real-market check">
                <p className="text-sm text-muted">
                  Against {investment.real_market.n_real_sale_listings} live listings, real median is{" "}
                  AED {investment.real_market.real_median_price_per_sqm.toLocaleString()}/sqm. ML is{" "}
                  {investment.real_market.model_vs_real_pct > 0 ? "+" : ""}
                  {investment.real_market.model_vs_real_pct}% vs real — {investment.real_market.verdict}.
                </p>
              </Section>
            )}
          </>
        ) : (
          <>
            <Section title="Current supply">
              {BUCKETS.map((b) => (
                <KV
                  key={b}
                  k={b.replace(/^\w/, (c) => c.toUpperCase())}
                  v={`${m.bucket_counts_used[b]} facilities · ${score.supply_breakdown[b].toFixed(0)}% adequate`}
                />
              ))}
            </Section>
            <Section title="Gap deductions">
              {score.deductions
                .filter((d) => d.points > 0.05)
                .map((d) => (
                  <div key={d.category} className="border-l-2 pl-3" style={{ borderColor: gapColor(d.points * 4) }}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium capitalize">{d.category}</span>
                      <span style={{ color: gapColor(d.points * 4) }}>−{d.points.toFixed(1)} pts</span>
                    </div>
                    <p className="text-xs text-muted">{d.reason}</p>
                  </div>
                ))}
            </Section>
          </>
        )}

        {narrative && (
          <Section title={`AI ${type} briefing`}>
            <Markdown>{narrative}</Markdown>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 border-b border-border pb-1 text-sm font-semibold text-accent">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{k}</span>
      <span className="font-medium text-foreground">{v}</span>
    </div>
  );
}
