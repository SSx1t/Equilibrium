import type {
  AmenityOverride,
  BriefingMode,
  BriefingResponse,
  DistrictsResponse,
  HeatmapResponse,
  InvestmentResult,
  ScoreResult,
  SimulateRequest,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Render's free tier puts the backend to sleep after ~15 min idle; the first
// request then takes ~50s to cold start. We don't want that to surface as an
// error, so requests are retried with backoff over a budget long enough to
// outlast a cold start, and a single warm-up ping is fired on app load.
const COLD_START_BUDGET_MS = 70_000;
const ATTEMPT_TIMEOUT_MS = 12_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 3_000, 5_000, 8_000, 8_000, 8_000, 8_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fetch that times out a single attempt instead of hanging forever. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fetch JSON, retrying network/5xx failures with backoff until the cold-start
 * budget is exhausted. 4xx responses (except 503/504) fail fast — they are real
 * client errors, not a sleeping server.
 */
async function fetchJSONResilient<T>(
  path: string,
  init: RequestInit
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const deadline = Date.now() + COLD_START_BUDGET_MS;
  let attempt = 0;
  let lastErr: unknown;

  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(url, init, ATTEMPT_TIMEOUT_MS);
      if (res.ok) return (await res.json()) as T;

      // 502/503/504 happen while the dyno is still spinning up — keep retrying.
      const wakingUp = res.status === 502 || res.status === 503 || res.status === 504;
      if (!wakingUp) {
        let detail = `${res.status}`;
        try {
          const j = await res.json();
          detail = j.detail ?? detail;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(detail);
      }
      lastErr = new Error(`server waking up (${res.status})`);
    } catch (e) {
      // AbortError (timeout) and network errors are expected during cold start.
      lastErr = e;
    }

    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    attempt += 1;
    if (Date.now() + delay >= deadline) break;
    await sleep(delay);
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("Cannot reach the API server.");
}

const getJSON = <T>(path: string) =>
  fetchJSONResilient<T>(path, { cache: "no-store" });

const postJSON = <T>(path: string, body: unknown) =>
  fetchJSONResilient<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * Best-effort warm-up ping. Fired as soon as the app loads so the backend
 * starts spinning up while the user looks at the (snapshot-seeded) UI. Resolves
 * true once the server answers, false if it never wakes within the budget.
 */
export async function warmUp(): Promise<boolean> {
  const deadline = Date.now() + COLD_START_BUDGET_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/health`,
        { cache: "no-store" },
        ATTEMPT_TIMEOUT_MS
      );
      if (res.ok) return true;
    } catch {
      /* still asleep */
    }
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    attempt += 1;
    if (Date.now() + delay >= deadline) break;
    await sleep(delay);
  }
  return false;
}

export const getDistricts = () => getJSON<DistrictsResponse>("/districts");
export const getHeatmap = () => getJSON<HeatmapResponse>("/heatmap");
export const simulate = (req: SimulateRequest) =>
  postJSON<ScoreResult>("/simulate", req);
export const getInvestment = (req: SimulateRequest) =>
  postJSON<InvestmentResult>("/investment", req);
export const simulateHeatmap = (amenity_overrides: AmenityOverride[]) =>
  postJSON<HeatmapResponse>("/heatmap/simulate", { amenity_overrides });
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
