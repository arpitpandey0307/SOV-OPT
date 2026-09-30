export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const V1 = `${API_BASE}/api/v1`;

export type Kind = "LP" | "MILP" | "QP" | "MIQP" | string;
export type HealthStatus = "ok" | "warn" | "risk" | "info";

export interface Collection {
  id: string;
  title: string;
  kind: string;
  description: string;
  count: number;
  analyzed: number;
  with_reference: number;
  size_bytes: number;
}

export interface ModelSummary {
  collection: string;
  name: string;
  size_bytes: number;
  kind: Kind;
  rows: number | null;
  cols: number | null;
  nnz: number | null;
  integer_cols: number | null;
  reference_objective: number | null;
  reference_source: string | null;
  reference_status: "opt" | "best" | "inf" | "unbd" | "unkn" | null;
  analyzable: boolean;
  analysis_state: "ready" | "running" | "pending" | "failed" | "unavailable";
  meta: Record<string, string | number | boolean>;
}

export interface ModelDetail extends ModelSummary {
  collection_title: string;
  runs: Run[];
}

export interface HealthItem {
  key: string;
  label: string;
  status: HealthStatus;
  value: string;
  statistic: string;
  detail: string;
}

export interface Analysis {
  name: string;
  kind: Kind;
  sense: "MIN" | "MAX";
  rows: number;
  cols: number;
  nnz: number;
  density: number;
  row_types: { E: number; L: number; G: number };
  ranges: number;
  integer_cols: number;
  binary_cols: number;
  continuous_cols: number;
  free_cols: number;
  fixed_cols: number;
  boxed_cols: number;
  objective_nnz: number;
  quadratic_nnz: number;
  quadratic_diag: number;
  coef_min: number | null;
  coef_max: number | null;
  obj_min: number | null;
  obj_max: number | null;
  rhs_min: number | null;
  rhs_max: number | null;
  coef_hist: { exp: number; count: number }[];
  row_nnz_max: number;
  row_nnz_avg: number;
  col_nnz_max: number;
  col_nnz_avg: number;
  empty_rows: number;
  singleton_rows: number;
  empty_cols: number;
  singleton_cols: number;
  rows_bad_ratio: number;
  big_m_rows: number;
  sparsity: { rows: number; cols: number; cells: number[] };
  health: HealthItem[];
  health_status: HealthStatus;
}

export interface AnalysisResponse {
  state: ModelSummary["analysis_state"];
  analysis: Analysis | null;
  lines?: number;
  error?: string | null;
}

export interface RunConfig {
  algorithm: "auto" | "dual_simplex" | "primal_simplex" | "ipm" | "pdlp";
  time_limit: number;
  mip_gap: number;
  gpu: boolean;
  threads: number;
  seed: number;
  presolve: boolean;
  deterministic: boolean;
}

export interface VerificationCheck {
  check: string;
  value: number;
  tolerance: number;
  passed: boolean;
}

export interface Verification {
  verdict: string;
  precision?: string;
  checks: VerificationCheck[];
  max_primal_violation?: number;
}

export interface Run {
  id: string;
  collection: string;
  instance: string;
  kind: Kind;
  config: RunConfig;
  engine: string;
  status: "queued" | "running" | "completed" | "cancelled" | "failed";
  result_status: string | null;
  objective: number | null;
  bound: number | null;
  gap: number | null;
  iterations: number;
  nodes: number;
  elapsed: number;
  verification: Verification | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  reference_objective?: number | null;
  reference_source?: string | null;
  reference_status?: string | null;
}

export interface SolverEvent {
  seq: number;
  t: number;
  type: string;
  data: Record<string, unknown>;
}

export interface Gpu {
  name: string;
  driver: string;
  memory_total_mb: number | null;
  memory_used_mb: number | null;
  utilization_gpu: number | null;
  utilization_memory: number | null;
  temperature_c: number | null;
  power_w: number | null;
  power_limit_w: number | null;
  clock_sm_mhz: number | null;
  clock_sm_max_mhz: number | null;
  pcie_gen: number | null;
  pcie_width: number | null;
}

export interface SystemInfo {
  solver_version: string;
  engine: string;
  host: { os: string; cpu: string; logical_cores: number; memory_bytes: number | null; python: string };
  gpus: Gpu[];
  active_runs: number;
}

export interface Overview {
  collections: Collection[];
  run_counts: Record<string, number>;
  recent_runs: Run[];
  active_runs: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${V1}${path}`, init);
  } catch {
    throw new ApiError(0, "The SOV-OPT service is not reachable. Check that the control plane is running.");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : msg;
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  overview: () => request<Overview>("/overview"),
  system: () => request<SystemInfo>("/system"),
  gpu: () => request<{ t: number; gpus: Gpu[] }>("/system/gpu"),
  collections: () => request<Collection[]>("/collections"),
  models: (p: { collection?: string; q?: string; kind?: string; sort?: string; offset?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
    return request<{ total: number; items: ModelSummary[] }>(`/models?${qs}`);
  },
  model: (c: string, n: string) => request<ModelDetail>(`/models/${enc(c)}/${enc(n)}`),
  analysis: async (c: string, n: string): Promise<AnalysisResponse> => request(`/models/${enc(c)}/${enc(n)}/analysis`),
  fingerprint: (c: string, n: string) =>
    request<{ sha256: string; size_bytes: number }>(`/models/${enc(c)}/${enc(n)}/fingerprint`),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ModelSummary>("/models", { method: "POST", body: fd });
  },
  createRun: (c: string, n: string, cfg: Partial<RunConfig>) =>
    request<Run>(`/models/${enc(c)}/${enc(n)}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cfg),
    }),
  runs: (p: { limit?: number; collection?: string; instance?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)));
    return request<Run[]>(`/runs?${qs}`);
  },
  run: (id: string) => request<Run>(`/runs/${enc(id)}`),
  cancelRun: (id: string) => request<{ status: string }>(`/runs/${enc(id)}/cancel`, { method: "POST" }),
  passport: (id: string) => request<Record<string, unknown>>(`/runs/${enc(id)}/passport`),
  evidenceUrl: (id: string) => `${V1}/runs/${enc(id)}/evidence`,
  eventsUrl: (id: string) => `${V1}/runs/${enc(id)}/events`,
};
