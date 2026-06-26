export type Bucket = "healthcare" | "education" | "transit" | "retail" | "parks";

export const BUCKETS: Bucket[] = [
  "healthcare",
  "education",
  "transit",
  "retail",
  "parks",
];

export interface DistrictSummary {
  district_id: string;
  name: string;
  lat: number;
  lon: number;
  gap_score: number;
  demand_index: number;
  supply_breakdown: Record<Bucket, number>;
  area_type: string | null;
  profile: string | null;
  population: number;
  is_hypothetical: boolean;
}

export interface DistrictsResponse {
  count: number;
  districts: DistrictSummary[];
}

export interface HeatPoint {
  lat: number;
  lon: number;
  weight: number;
}

export interface HeatmapResponse {
  meta: Record<string, unknown>;
  count: number;
  points: HeatPoint[];
}

export interface Deduction {
  category: Bucket;
  points: number;
  reason: string;
  supply_count: number;
  per_1000_residents: number;
  benchmark_per_1000: number;
}

export interface ScoreMeta {
  district_id: string;
  population_baseline: number;
  population_simulated: number;
  population_multiplier: number;
  demand_intensity: number;
  service_demand_index: number;
  occupancy_rate: number;
  transaction_activity_norm: number;
  bucket_counts_used: Record<Bucket, number>;
  bucket_counts_baseline: Record<Bucket, number>;
  amenity_override_delta: Record<Bucket, number>;
  ignored_overrides: unknown[];
  is_hypothetical: boolean;
  hypothetical_note: string;
}

export interface ScoreResult {
  gap_score: number;
  demand_index: number;
  supply_breakdown: Record<Bucket, number>;
  deductions: Deduction[];
  meta: ScoreMeta;
}

export type OverrideAction = "add" | "remove";

export interface AmenityOverride {
  lat: number;
  lon: number;
  type: string;
  action: OverrideAction;
}

export interface SimulateRequest {
  district_id: string;
  amenity_overrides?: AmenityOverride[];
  population_multiplier?: number;
}

export interface InvestmentResult {
  district_id: string;
  ml: {
    expected_price_per_sqm_aed: number;
    expected_annual_rent_per_sqm_aed: number;
    gross_yield_pct: number;
    payback_years: number | null;
    model_metrics: {
      model: string;
      target: string;
      n_train: number;
      n_test: number;
      r2: number;
      mae_aed: number;
    };
    top_features: { feature: string; importance: number }[];
  };
  investment_score: number;
  opportunity_score: number;
  risk_score: number;
  rating: string;
  score_components: Record<string, number>;
  baseline_investment_score: number;
  scenario_delta: number;
  is_hypothetical: boolean;
  real_market: {
    n_real_sale_listings: number;
    real_median_price_per_sqm: number;
    model_vs_real_pct: number;
    verdict: string;
  } | null;
  real_market_meta: Record<string, unknown> | null;
  note: string;
}

export type BriefingMode = "planner" | "investor";

export interface BriefingResponse {
  district_id: string;
  mode: BriefingMode;
  briefing: string;
  model: string;
  is_hypothetical: boolean;
  disclaimer: string;
}
