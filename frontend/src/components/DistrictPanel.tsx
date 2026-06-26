"use client";

import { gapColor, gapColorA } from "@/lib/color";
import { BUCKETS, type Bucket, type ScoreResult } from "@/lib/types";
import { HypotheticalBadge } from "./HypotheticalBadge";

const BUCKET_LABEL: Record<Bucket, string> = {
  healthcare: "Healthcare",
  education: "Education",
  transit: "Transit",
  retail: "Retail",
  parks: "Parks",
};

function BucketIcon({ bucket }: { bucket: Bucket }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (bucket) {
    case "healthcare":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "education":
      return (
        <svg {...common}>
          <path d="M22 10L12 5 2 10l10 5 10-5z" />
          <path d="M6 12v5c0 1 3 2 6 2s6-1 6-2v-5" />
        </svg>
      );
    case "transit":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="14" rx="2" />
          <path d="M4 11h16M8 21l1-3M16 21l-1-3" />
        </svg>
      );
    case "retail":
      return (
        <svg {...common}>
          <path d="M3 9l1-5h16l1 5M5 9v10h14V9M9 13h6" />
        </svg>
      );
    case "parks":
      return (
        <svg {...common}>
          <path d="M12 2l4 7h-3v5h-2V9H8l4-7zM10 14h4v7h-4z" />
        </svg>
      );
  }
}

function SupplyRow({
  bucket,
  count,
  adequacy,
  delta,
}: {
  bucket: Bucket;
  count: number;
  adequacy: number;
  delta: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-panel px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="text-accent">
          <BucketIcon bucket={bucket} />
        </span>
        <span className="text-sm text-foreground">{BUCKET_LABEL[bucket]}</span>
        {delta !== 0 && (
          <span className="text-xs font-medium text-warn">
            ({delta > 0 ? "+" : ""}
            {delta})
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {count}
        </span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: gapColorA(100 - adequacy, 0.16),
            color: gapColor(100 - adequacy),
          }}
        >
          {adequacy.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

export function DistrictPanel({ result }: { result: ScoreResult }) {
  const { supply_breakdown, deductions, meta } = result;
  const counts = meta.bucket_counts_used;

  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Current supply
        </h3>
        <div className="space-y-2">
          {BUCKETS.map((b) => (
            <SupplyRow
              key={b}
              bucket={b}
              count={counts[b]}
              adequacy={supply_breakdown[b]}
              delta={meta.amenity_override_delta[b]}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Gap deductions
        </h3>
        <div className="space-y-2">
          {deductions
            .filter((d) => d.points > 0.05)
            .map((d) => (
              <div
                key={d.category}
                className="rounded-xl border border-border bg-panel p-3"
                style={{ borderLeft: `3px solid ${gapColor(d.points * 4)}` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize text-foreground">
                    {d.category}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: gapColor(d.points * 4) }}
                  >
                    −{d.points.toFixed(1)} pts
                  </span>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted">{d.reason}</p>
              </div>
            ))}
        </div>
      </div>

      {meta.is_hypothetical && (
        <p className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/5 p-2.5 text-[11px] leading-snug text-warn">
          <HypotheticalBadge small />
          <span className="pt-0.5">{meta.hypothetical_note}</span>
        </p>
      )}
    </div>
  );
}
