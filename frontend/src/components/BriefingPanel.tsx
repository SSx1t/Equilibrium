"use client";

import { useEffect, useRef, useState } from "react";
import { getBriefing } from "@/lib/api";
import type {
  BriefingMode,
  BriefingResponse,
  InvestmentResult,
  ScoreResult,
} from "@/lib/types";
import { Markdown } from "./Markdown";

export function BriefingPanel({
  districtId,
  result,
  investment,
  mode,
  triggerSignal,
}: {
  districtId: string | null;
  result: ScoreResult | null;
  investment: InvestmentResult | null;
  mode: BriefingMode;
  triggerSignal: number;
}) {
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSignal = useRef(0);

  const disabled = !districtId || !result || loading;

  const run = async () => {
    if (!districtId || !result) return;
    setLoading(true);
    setError(null);
    setBriefing(null);
    try {
      const stateWithInvestment = {
        ...result,
        investment: investment ?? undefined,
      } as ScoreResult;
      const res = await getBriefing(districtId, mode, stateWithInvestment);
      setBriefing(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Briefing failed.");
    } finally {
      setLoading(false);
    }
  };

  // Fire when the header "Generate Briefing" button is pressed.
  useEffect(() => {
    if (triggerSignal > 0 && triggerSignal !== lastSignal.current) {
      lastSignal.current = triggerSignal;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerSignal]);

  const isTemplate = briefing?.source === "template_fallback";

  return (
    <div className="space-y-3 p-4">
      <button
        type="button"
        onClick={run}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
        </svg>
        {loading ? "Generating…" : `Generate ${mode} briefing`}
      </button>

      <p className="text-center text-[11px] text-muted">
        On-demand AI · grounded in the numbers above
      </p>

      {error && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-xs text-bad">
          {error}
        </div>
      )}

      {briefing && (
        <div className="space-y-2 rounded-xl border border-border bg-panel-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              {briefing.mode} briefing
            </span>
            <div className="flex items-center gap-1.5">
              {isTemplate && (
                <span className="rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[9px] font-medium text-warn">
                  RULE-BASED
                </span>
              )}
              {briefing.is_hypothetical && (
                <span className="text-[10px] font-medium text-warn">
                  includes what-if
                </span>
              )}
            </div>
          </div>
          <Markdown>{briefing.briefing}</Markdown>
          <p className="border-t border-border pt-2 text-[10px] leading-snug text-muted">
            {briefing.disclaimer} · {briefing.model}
          </p>
        </div>
      )}
    </div>
  );
}
