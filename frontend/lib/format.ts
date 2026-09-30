export function int(n: number | null | undefined): string {
  if (n === null || n === undefined) return "n/a";
  return n.toLocaleString("en-US");
}

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "n/a";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return n.toLocaleString("en-US");
}

export function num(v: number | null | undefined, digits = 6): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e9 || a < 1e-4) return v.toExponential(digits - 1).replace("e+", "e");
  return Number(v.toPrecision(digits)).toLocaleString("en-US", { maximumFractionDigits: 10 });
}

export function sci(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "n/a";
  if (v === 0) return "0";
  return v.toExponential(digits).replace("e+", "e");
}

export function pct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "n/a";
  return `${(v * 100).toFixed(digits)}%`;
}

export function bytes(n: number | null | undefined): string {
  if (!n) return "n/a";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function seconds(s: number | null | undefined): string {
  if (s === null || s === undefined) return "n/a";
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
  if (s < 60) return `${s.toFixed(2)} s`;
  const m = Math.floor(s / 60);
  return `${m}m ${(s - m * 60).toFixed(0)}s`;
}

export function ago(ts: number | null | undefined): string {
  if (!ts) return "n/a";
  const d = Date.now() / 1000 - ts;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(ts * 1000).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

const ACRONYMS: Record<string, string> = { gpu: "GPU", rins: "RINS", lp: "LP", mip: "MIP", ipm: "IPM", pdlp: "PDLP", cpu: "CPU" };

export function label(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w, i) => ACRONYMS[w] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function relError(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return Math.abs(a - b) / Math.max(1, Math.abs(b));
}

export function reference(status: string | null | undefined, value: number | null | undefined, digits = 8): string {
  if (status === "inf") return "infeasible";
  if (status === "unbd") return "unbounded";
  if (status === "unkn" || !status) return "n/a";
  const v = num(value, digits);
  return status === "best" ? `${v} (best known)` : v;
}
