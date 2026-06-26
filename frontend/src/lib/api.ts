import type {
  BriefingMode,
  BriefingResponse,
  DistrictsResponse,
  HeatmapResponse,
  ScoreResult,
  SimulateRequest,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const getDistricts = () => getJSON<DistrictsResponse>("/districts");
export const getHeatmap = () => getJSON<HeatmapResponse>("/heatmap");
export const simulate = (req: SimulateRequest) =>
  postJSON<ScoreResult>("/simulate", req);
export const getBriefing = (
  district_id: string,
  mode: BriefingMode,
  current_score_state: ScoreResult
) =>
  postJSON<BriefingResponse>("/briefing", {
    district_id,
    mode,
    current_score_state,
  });
