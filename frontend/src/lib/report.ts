import { jsPDF } from "jspdf";
import { BUCKETS, type Bucket, type InvestmentResult, type ScoreResult } from "./types";

export interface ReportInput {
  districtName: string;
  areaType?: string | null;
  type: "planner" | "investor";
  score: ScoreResult;
  investment?: InvestmentResult | null;
  narrative?: string | null;
  generatedAt: Date;
}

const TEAL: [number, number, number] = [13, 148, 136];
const INK: [number, number, number] = [26, 34, 51];
const MUTED: [number, number, number] = [107, 120, 144];
const LINE: [number, number, number] = [220, 226, 236];

const BUCKET_LABEL: Record<Bucket, string> = {
  healthcare: "Healthcare",
  education: "Education",
  transit: "Transit",
  retail: "Retail",
  parks: "Parks",
};

function stripMd(s: string): string {
  return s
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "•  ")
    .replace(/`/g, "")
    .trim();
}

export function buildReportPdf(input: ReportInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 18;
  const CW = W - M * 2;
  let y = 16;

  const setColor = (c: [number, number, number]) =>
    doc.setTextColor(c[0], c[1], c[2]);

  // ---------- brand header ----------
  const cx = M + 4;
  const cy = y + 2;
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.7);
  doc.circle(cx, cy, 4.2, "S");
  doc.line(cx - 6, cy, cx + 6, cy);
  // teal upper-right arc approximation
  doc.setDrawColor(TEAL[0], TEAL[1], TEAL[2]);
  const seg: [number, number][] = [];
  for (let a = -90; a <= 0; a += 12) {
    const r = (a * Math.PI) / 180;
    seg.push([cx + 4.2 * Math.cos(r), cy + 4.2 * Math.sin(r)]);
  }
  for (let i = 1; i < seg.length; i++)
    doc.line(seg[i - 1][0], seg[i - 1][1], seg[i][0], seg[i][1]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  setColor(INK);
  doc.text("EQUILIBRIUM URBAN", cx + 9, cy - 0.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setColor(TEAL);
  doc.text("AI PROPTECH SOLUTIONS", cx + 9, cy + 3.6);

  // right: report type + date
  doc.setFontSize(8);
  setColor(MUTED);
  const label =
    input.type === "investor" ? "INVESTOR REPORT" : "PLANNER REPORT";
  doc.text(label, W - M, cy - 0.5, { align: "right" });
  doc.text(
    input.generatedAt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    W - M,
    cy + 3.6,
    { align: "right" }
  );

  y = cy + 9;
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.4);
  doc.line(M, y, W - M, y);
  y += 9;

  // ---------- title ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  setColor(INK);
  doc.text(input.districtName, M, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setColor(MUTED);
  const sub = `${input.areaType ?? "district"} · ${input.score.meta.population_simulated.toLocaleString()} residents · ${
    input.type === "investor" ? "Investment outlook" : "Service-gap assessment"
  }`;
  doc.text(sub, M, y);
  y += 7;

  // scenario note
  const m = input.score.meta;
  if (m.is_hypothetical) {
    const edits = Object.entries(m.amenity_override_delta)
      .filter(([, v]) => v)
      .map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k}`)
      .join(", ");
    doc.setFillColor(255, 247, 230);
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(M, y, CW, 9, 1.5, 1.5, "FD");
    doc.setFontSize(8);
    doc.setTextColor(180, 120, 10);
    doc.text(
      `WHAT-IF SCENARIO (hypothetical, not recorded data): population x${m.population_multiplier}` +
        (edits ? ` · amenities ${edits}` : ""),
      M + 3,
      y + 5.6
    );
    y += 14;
  } else {
    doc.setFontSize(8);
    setColor(MUTED);
    doc.text("Baseline — derived from recorded datasets.", M, y);
    y += 7;
  }

  // ---------- metric cards ----------
  const cards =
    input.type === "investor" && input.investment
      ? [
          {
            label: "Investment Score",
            value: `${input.investment.investment_score}`,
            note: input.investment.rating,
          },
          {
            label: "Opportunity",
            value: `${input.investment.opportunity_score}`,
            note: "value-add upside",
          },
          {
            label: "Risk",
            value: `${input.investment.risk_score}`,
            note: "service strain",
          },
        ]
      : [
          {
            label: "Gap Score",
            value: `${input.score.gap_score.toFixed(0)}`,
            note: "/ 100",
          },
          {
            label: "Demand Index",
            value: `${input.score.demand_index.toFixed(0)}`,
            note: "/ 100",
          },
          {
            label: "Top deficit",
            value: capitalize(input.score.deductions[0]?.category ?? "—"),
            note: `${input.score.deductions[0]?.points.toFixed(1) ?? 0} pts`,
          },
        ];

  const gap = 5;
  const cardW = (CW - gap * 2) / 3;
  cards.forEach((c, i) => {
    const x = M + i * (cardW + gap);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, cardW, 22, 2, 2, "FD");
    doc.setFontSize(7.5);
    setColor(MUTED);
    doc.text(c.label.toUpperCase(), x + 4, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    setColor(INK);
    doc.text(c.value, x + 4, y + 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(MUTED);
    doc.text(c.note, x + 4, y + 19.5);
  });
  y += 30;

  // ---------- sections ----------
  const sectionTitle = (t: string) => {
    ensure(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    setColor(TEAL);
    doc.text(t, M, y);
    y += 2;
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.line(M, y, W - M, y);
    y += 6;
    doc.setFont("helvetica", "normal");
  };

  function ensure(space: number) {
    if (y + space > 285) {
      doc.addPage();
      y = 20;
    }
  }

  function wrapped(text: string, size = 9, color = INK, lh = 4.6) {
    doc.setFontSize(size);
    setColor(color);
    const lines = doc.splitTextToSize(text, CW);
    for (const ln of lines) {
      ensure(lh);
      doc.text(ln, M, y);
      y += lh;
    }
  }

  if (input.type === "investor" && input.investment) {
    const inv = input.investment;
    sectionTitle("ML Valuation");
    const rows: [string, string][] = [
      ["Expected price / sqm", `AED ${inv.ml.expected_price_per_sqm_aed.toLocaleString()}`],
      ["Gross yield", `${inv.ml.gross_yield_pct}%`],
      ["Expected annual rent / sqm", `AED ${inv.ml.expected_annual_rent_per_sqm_aed.toLocaleString()}`],
      ["Payback", `${inv.ml.payback_years ?? "—"} years`],
      ["Model", `${inv.ml.model_metrics.model} (R\u00B2=${inv.ml.model_metrics.r2})`],
    ];
    keyValueTable(rows);
    y += 3;

    if (inv.real_market) {
      sectionTitle("Real-market check");
      wrapped(
        `Against ${inv.real_market.n_real_sale_listings} live eVoost sale listings, the real median is ` +
          `AED ${inv.real_market.real_median_price_per_sqm.toLocaleString()}/sqm. The ML valuation is ` +
          `${inv.real_market.model_vs_real_pct > 0 ? "+" : ""}${inv.real_market.model_vs_real_pct}% vs real — ${inv.real_market.verdict}.`
      );
      y += 3;
    }

    sectionTitle("Opportunity vs risk");
    wrapped(
      `Opportunity score ${inv.opportunity_score}/100 reflects latent demand behind a closable service gap. ` +
        `Risk score ${inv.risk_score}/100 reflects service-strain exposure. ` +
        `This scenario shifts the investment score by ${inv.scenario_delta > 0 ? "+" : ""}${inv.scenario_delta} pts vs baseline.`
    );
    y += 3;
    sectionTitle("Investment drivers");
    keyValueTable(
      Object.entries(inv.score_components).map(([k, v]) => [
        capitalize(k.replace(/_/g, " ")),
        `${v}/100`,
      ])
    );
  } else {
    sectionTitle("Current supply");
    keyValueTable(
      BUCKETS.map((b) => [
        BUCKET_LABEL[b],
        `${input.score.meta.bucket_counts_used[b]} facilities · ${input.score.supply_breakdown[b].toFixed(0)}% adequate`,
      ])
    );
    y += 3;

    sectionTitle("Gap deductions");
    for (const d of input.score.deductions.filter((x) => x.points > 0.05)) {
      ensure(11);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setColor(INK);
      doc.text(
        `${capitalize(d.category)}  —  ${d.points.toFixed(1)} pts`,
        M,
        y
      );
      y += 4.4;
      doc.setFont("helvetica", "normal");
      wrapped(d.reason, 8.5, MUTED, 4.2);
      y += 1.5;
    }
    y += 2;

    sectionTitle("Recommended actions");
    const top = input.score.deductions.filter((d) => d.points > 0.05).slice(0, 3);
    top.forEach((d, i) => {
      wrapped(
        `${i + 1}. Prioritise ${d.category} provision — currently ${input.score.supply_breakdown[d.category].toFixed(0)}% of the adequacy benchmark. Adding facilities here is the fastest lever to lower the gap score.`,
        9
      );
      y += 1;
    });
  }

  // ---------- AI narrative ----------
  if (input.narrative) {
    y += 3;
    sectionTitle(
      input.type === "investor" ? "AI investor briefing" : "AI planner briefing"
    );
    wrapped(stripMd(input.narrative), 9, INK, 4.7);
  }

  // ---------- footer on every page ----------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.line(M, 290, W - M, 290);
    doc.setFontSize(7);
    setColor(MUTED);
    doc.text(
      "Equilibrium Urban · synthetic Abu Dhabi datasets + eVoost live listings · figures marked WHAT-IF are hypothetical",
      M,
      294
    );
    doc.text(`${p} / ${pages}`, W - M, 294, { align: "right" });
  }

  function keyValueTable(rows: [string, string][]) {
    doc.setFontSize(9);
    for (const [k, v] of rows) {
      ensure(6);
      setColor(MUTED);
      doc.text(k, M, y);
      setColor(INK);
      doc.text(v, W - M, y, { align: "right" });
      y += 5.6;
    }
  }

  return doc;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function downloadReportPdf(input: ReportInput) {
  const doc = buildReportPdf(input);
  const safe = input.districtName.replace(/[^a-z0-9]+/gi, "_");
  doc.save(`Equilibrium_${input.type}_${safe}.pdf`);
}
