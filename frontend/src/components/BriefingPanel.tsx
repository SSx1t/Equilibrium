"use client";

import { useState } from "react";
import { getBriefing } from "@/lib/api";
import type { BriefingMode, BriefingResponse, ScoreResult } from "@/lib/types";

export function BriefingPanel({
  districtId,
  result,
}: {
  districtId: string | null;
  result: ScoreResult | null;
}) {
  const [mode, setMode] = useState<BriefingMode>("planner");
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = !districtId || !result || loading;

  const run = async () => {
    if (!districtId || !result) return;
    setLoading(true);
    setError(null);
    setBriefing(null);
    try {
      const res = await getBriefing(districtId, mode, result);
      setBriefing(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Briefing failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-border p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
        AI briefing
      </h3>

      <div className="flex rounded-lg border border-border bg-panel-2 p-0.5 text-xs">
        {(["planner", "investor"] as BriefingMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md py-1.5 font-medium capitalize transition-colors ${
              mode === m
                ? "bg-accent text-[#06243a]"
                : "text-muted hover:text-foreground"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={run}
        disabled={disabled}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-[#06243a] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "Generating…" : "Generate briefing"}
      </button>

      <p className="text-[11px] leading-snug text-muted">
        Calls the Anthropic API on demand only. Uses the exact numbers shown,
        and flags any what-if edits.
      </p>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {briefing && (
        <div className="space-y-2 rounded-lg border border-border bg-panel-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted">
              {briefing.mode} briefing
            </span>
            {briefing.is_hypothetical && (
              <span className="text-[10px] font-medium text-amber-300">
                includes what-if
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {briefing.briefing}
          </p>
          <p className="border-t border-border pt-2 text-[10px] leading-snug text-muted">
            {briefing.disclaimer} · {briefing.model}
          </p>
        </div>
      )}
    </div>
  );
}
