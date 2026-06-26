"use client";

import type { InvestmentResult } from "@/lib/types";
import { HypotheticalBadge } from "./HypotheticalBadge";

function ratingColor(rating: string): string {
  switch (rating) {
    case "Strong":
      return "#22c55e";
    case "Attractive":
      return "#84cc16";
    case "Moderate":
      return "#eab308";
    default:
      return "#f97316";
  }
}

function aed(n: number): string {
  return "AED " + n.toLocaleString();
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-foreground/80">{label}</span>
        <span className="font-mono text-muted">{value.toFixed(0)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function InvestmentPanel({
  data,
  loading,
}: {
  data: InvestmentResult | null;
  loading: boolean;
}) {
  if (!data) {
    return (
      <div className="border-t border-border p-5 text-sm text-muted">
        {loading ? "Running ML model…" : "Select a district for the investment view."}
      </div>
    );
  }

  const { ml, scenario_delta, real_market } = data;
  const deltaUp = scenario_delta > 0;

  return (
    <div className="space-y-4 border-t border-border p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Investment outlook (ML)
        </h3>
        {data.is_hypothetical && <HypotheticalBadge small />}
      </div>

      {/* Score hero */}
      <div className="flex items-stretch gap-3">
        <div className="flex flex-1 flex-col justify-center rounded-xl border border-border bg-panel-2 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Investment score
          </div>
          <div
            className="text-3xl font-bold tabular-nums"
            style={{ color: ratingColor(data.rating) }}
          >
            {data.investment_score.toFixed(0)}
          </div>
          <div
            className="text-xs font-medium"
            style={{ color: ratingColor(data.rating) }}
          >
            {data.rating}
          </div>
          {scenario_delta !== 0 && (
            <div
              className={`mt-0.5 text-[11px] ${
                deltaUp ? "text-green-400" : "text-red-400"
              }`}
            >
              {deltaUp ? "▲" : "▼"} {Math.abs(scenario_delta).toFixed(1)} vs
              baseline
            </div>
          )}
        </div>
        <div className="grid flex-1 grid-rows-2 gap-2">
          <div className="rounded-lg border border-border bg-panel-2 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Opportunity
            </div>
            <div className="text-lg font-bold tabular-nums text-lime-400">
              {data.opportunity_score.toFixed(0)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-panel-2 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Risk
            </div>
            <div className="text-lg font-bold tabular-nums text-orange-400">
              {data.risk_score.toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      {/* ML valuation */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-border bg-panel-2 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            ML price / sqm
          </div>
          <div className="font-mono text-sm text-foreground">
            {aed(ml.expected_price_per_sqm_aed)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-panel-2 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Gross yield
          </div>
          <div className="font-mono text-sm text-foreground">
            {ml.gross_yield_pct}% · {ml.payback_years}y payback
          </div>
        </div>
        <div className="col-span-2 rounded-lg border border-border bg-panel-2 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Expected annual rent / sqm
          </div>
          <div className="font-mono text-sm text-foreground">
            {aed(ml.expected_annual_rent_per_sqm_aed)}
          </div>
        </div>
      </div>

      {/* Real market reconciliation */}
      {real_market ? (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5 text-[11px] leading-snug">
          <div className="mb-0.5 font-medium text-sky-300">
            Real-market check · {real_market.n_real_sale_listings} live listings
          </div>
          <div className="text-foreground/80">
            Real median {aed(real_market.real_median_price_per_sqm)}/sqm · model is{" "}
            <span
              className={
                real_market.model_vs_real_pct < 0
                  ? "text-green-400"
                  : "text-orange-400"
              }
            >
              {real_market.model_vs_real_pct > 0 ? "+" : ""}
              {real_market.model_vs_real_pct}%
            </span>{" "}
            vs real — {real_market.verdict}.
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-muted">
          No live eVoost sale listings cached for this district — valuation from
          the synthetic transactions model only.
        </p>
      )}

      {/* Score components */}
      <div className="space-y-2">
        <div className="text-[11px] font-medium text-foreground/80">
          Score drivers
        </div>
        {Object.entries(data.score_components).map(([k, v]) => (
          <Bar key={k} label={k.replace(/_/g, " ")} value={v} />
        ))}
      </div>

      {/* Model provenance */}
      <details className="text-[11px] text-muted">
        <summary className="cursor-pointer select-none">
          ML model: {ml.model_metrics.model} · R²={ml.model_metrics.r2}
        </summary>
        <div className="mt-1.5 space-y-1 border-l border-border pl-2">
          <div>
            Trained on {ml.model_metrics.n_train.toLocaleString()} transactions ·
            MAE {aed(ml.model_metrics.mae_aed)} · target{" "}
            {ml.model_metrics.target}
          </div>
          <div>Top price drivers:</div>
          <ul className="list-disc pl-4">
            {ml.top_features.slice(0, 5).map((f) => (
              <li key={f.feature}>
                {f.feature.replace(/_/g, " ")} ({(f.importance * 100).toFixed(0)}%)
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
