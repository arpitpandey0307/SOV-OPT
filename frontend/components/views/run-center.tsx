"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Run, type SolverEvent, type Verification } from "@/lib/api";
import { useRunStream, type StreamState } from "@/lib/use-run-stream";
import { int, label, num, pct, sci, seconds } from "@/lib/format";
import { PageHeader } from "@/components/platform/shell";
import { NewRunDialog, RunStatusBadge, VerdictBadge } from "@/components/platform/runs";
import { EChart, baseAxis, baseTooltip, chartTheme } from "@/components/charts/echart";
import { Badge, Button, EmptyState, ErrorState, Panel, Skeleton } from "@/components/ui";

type D = Record<string, unknown>;
const n = (v: unknown) => (typeof v === "number" ? v : null);

const TABS = ["progress", "timeline", "numerics", "gpu", "evidence"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  progress: "Progress",
  timeline: "Timeline",
  numerics: "Numerics",
  gpu: "GPU",
  evidence: "Evidence",
};

export function RunCenterView({ runId }: { runId: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = (sp.get("tab") ?? "progress") as (typeof TABS)[number];
  const qc = useQueryClient();

  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.run(runId),
    refetchInterval: (q) => (q.state.data && ["queued", "running"].includes(q.state.data.status) ? 2000 : false),
  });
  const { events, state } = useRunStream(runId);
  const cancel = useMutation({
    mutationFn: () => api.cancelRun(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["run", runId] }),
  });

  const derived = useMemo(() => derive(events), [events]);

  if (run.isError) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorState
          title="Run not found"
          message={(run.error as Error).message}
          action={<Link href="/runs" className="text-sm text-accent">All runs</Link>}
        />
      </div>
    );
  }

  const r = run.data;
  const active = r ? ["queued", "running"].includes(r.status) : true;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <span>
            <Link href="/runs" className="hover:text-ink">Runs</Link>
            <span className="mx-2">/</span>
            <span className="font-mono normal-case tracking-normal">{runId}</span>
          </span>
        }
        title={
          r ? (
            <span className="flex flex-wrap items-center gap-3">
              <Link href={`/models/${r.collection}/${r.instance}`} className="hover:text-accent">
                {r.instance}
              </Link>
              <Badge>{derived.kind ?? r.kind}</Badge>
              <RunStatusBadge run={r} />
            </span>
          ) : (
            <Skeleton className="h-8 w-56" />
          )
        }
        description={r && <RunMeta run={r} stream={state} algorithm={derived.algorithm} />}
        actions={
          r && (
            <>
              {active ? (
                <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                  {cancel.isPending ? "Stopping" : "Stop run"}
                </Button>
              ) : (
                <>
                  <a href={api.evidenceUrl(runId)} download className="inline-flex h-10 items-center rounded-[3px] border border-rule-strong bg-panel px-4 text-sm font-medium text-ink hover:border-ink-3">
                    Download evidence
                  </a>
                  <NewRunDialog collection={r.collection} name={r.instance} kind={r.kind}>
                    <Button>Solve again</Button>
                  </NewRunDialog>
                </>
              )}
            </>
          )
        }
      />

      <Summary run={r} d={derived} />

      <Tabs.Root
        value={tab}
        onValueChange={(v) => router.replace(`${path}${v === "progress" ? "" : `?tab=${v}`}`, { scroll: false })}
        className="mt-8"
      >
        <Tabs.List aria-label="Run views" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-rule">
          {TABS.map((t) => (
            <Tabs.Trigger
              key={t}
              value={t}
              className="-mb-px shrink-0 border-b-2 border-transparent px-3 pb-2.5 text-sm text-ink-2 hover:text-ink data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink"
            >
              {TAB_LABEL[t]}
              {t === "numerics" && derived.numerical.length > 0 && (
                <span className="tabular ml-1.5 text-xs text-warn">{derived.numerical.length}</span>
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="progress" className="pt-6 focus:outline-none">
          <Progress d={derived} run={r} />
        </Tabs.Content>
        <Tabs.Content value="timeline" className="pt-6 focus:outline-none">
          <Timeline events={derived.milestones} />
        </Tabs.Content>
        <Tabs.Content value="numerics" className="pt-6 focus:outline-none">
          <Numerics d={derived} />
        </Tabs.Content>
        <Tabs.Content value="gpu" className="pt-6 focus:outline-none">
          <GpuTab d={derived} run={r} />
        </Tabs.Content>
        <Tabs.Content value="evidence" className="pt-6 focus:outline-none">
          <Evidence run={r} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

// ------------------------------------------------------------------ derive

interface Derived {
  kind: string | null;
  algorithm: string | null;
  decisionReason: string | null;
  objective: [number, number][];
  bound: [number, number][];
  incumbent: [number, number][];
  gap: [number, number][];
  residual: [number, number][];
  residualName: string;
  gpu: { t: number; utilization: number; kernel_ms: number; h2d_ms: number; d2h_ms: number }[];
  latest: D;
  milestones: SolverEvent[];
  numerical: SolverEvent[];
  presolve: D | null;
  scaling: D | null;
  budget: { label: string; t: number | null }[];
  t: number;
}

const MILESTONE_TYPES = new Set([
  "RUN_QUEUED", "RUN_STARTED", "MODEL_PROFILING", "MODEL_LOADED", "SOLVER_DECISION", "PRESOLVE_COMPLETED",
  "SCALING_COMPLETED", "SOLVE_STARTED", "PHASE_CHANGE", "FACTORIZATION", "ROOT_LP_SOLVED", "CUT_ROUND",
  "INCUMBENT_FOUND", "NUMERICAL_EVENT", "SOLVE_COMPLETED", "VERIFICATION_STARTED", "VERIFICATION_COMPLETED",
  "RUN_COMPLETED", "RUN_CANCELLED", "RUN_FAILED",
]);

function derive(events: SolverEvent[]): Derived {
  const d: Derived = {
    kind: null, algorithm: null, decisionReason: null, objective: [], bound: [], incumbent: [], gap: [],
    residual: [], residualName: "Primal infeasibility", gpu: [], latest: {}, milestones: [], numerical: [],
    presolve: null, scaling: null, budget: [], t: 0,
  };
  let firstFeasible: number | null = null;
  const gapHits: Record<string, number | null> = { "5%": null, "1%": null, "0.1%": null };
  let proven: number | null = null;

  for (const e of events) {
    const x = e.data as D;
    d.t = e.t;
    if (MILESTONE_TYPES.has(e.type)) d.milestones.push(e);
    switch (e.type) {
      case "MODEL_LOADED":
        d.kind = String(x.kind);
        break;
      case "SOLVER_DECISION":
        d.algorithm = String(x.algorithm);
        d.decisionReason = String(x.reason);
        break;
      case "PRESOLVE_COMPLETED":
        d.presolve = x;
        break;
      case "SCALING_COMPLETED":
        d.scaling = x;
        break;
      case "NUMERICAL_EVENT":
        d.numerical.push(e);
        break;
      case "ITERATION": {
        d.latest = x;
        const o = n(x.objective);
        if (o !== null) d.objective.push([e.t, o]);
        const res = n(x.primal_infeasibility) ?? n(x.mu);
        if (x.mu !== undefined) d.residualName = "Barrier parameter μ";
        if (res !== null && res > 0) d.residual.push([e.t, res]);
        break;
      }
      case "ROOT_LP_SOLVED":
      case "CUT_ROUND": {
        const b = n(x.bound) ?? n(x.objective);
        if (b !== null) d.bound.push([e.t, b]);
        break;
      }
      case "INCUMBENT_FOUND": {
        const o = n(x.objective);
        if (o !== null) d.incumbent.push([e.t, o]);
        if (firstFeasible === null) firstFeasible = e.t;
        break;
      }
      case "NODE_UPDATE": {
        d.latest = x;
        const b = n(x.bound);
        if (b !== null) d.bound.push([e.t, b]);
        const inc = n(x.incumbent);
        if (inc !== null) d.incumbent.push([e.t, inc]);
        const g = n(x.gap);
        if (g !== null) {
          d.gap.push([e.t, Math.max(g * 100, 1e-4)]);
          if (gapHits["5%"] === null && g <= 0.05) gapHits["5%"] = e.t;
          if (gapHits["1%"] === null && g <= 0.01) gapHits["1%"] = e.t;
          if (gapHits["0.1%"] === null && g <= 0.001) gapHits["0.1%"] = e.t;
        }
        break;
      }
      case "GPU_METRIC":
        d.gpu.push({ t: e.t, utilization: Number(x.utilization), kernel_ms: Number(x.kernel_ms), h2d_ms: Number(x.h2d_ms), d2h_ms: Number(x.d2h_ms) });
        break;
      case "SOLVE_COMPLETED":
        if (x.status === "OPTIMAL") proven = e.t;
        break;
    }
  }
  if (d.kind === "MILP" || d.kind === "MIQP") {
    d.budget = [
      { label: "First feasible", t: firstFeasible },
      { label: "Gap at most 5%", t: gapHits["5%"] },
      { label: "Gap at most 1%", t: gapHits["1%"] },
      { label: "Gap at most 0.1%", t: gapHits["0.1%"] },
      { label: "Optimality proved", t: proven },
    ];
  }
  return d;
}

// ------------------------------------------------------------------ header

const STREAM_WORD: Record<StreamState, string> = {
  connecting: "Connecting to stream",
  live: "Streaming live",
  reconnecting: "Reconnecting, events will resume",
  ended: "Stream complete",
  error: "Stream unavailable",
};

function RunMeta({ run, stream, algorithm }: { run: Run; stream: StreamState; algorithm: string | null }) {
  return (
    <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-3">
      <span>{algorithm ? label(algorithm) : "Selecting algorithm"}</span>
      <span>
        Time budget {run.config.time_limit}s · seed {run.config.seed} · {run.config.gpu ? "GPU on" : "CPU only"}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${stream === "live" ? "bg-ok" : stream === "ended" ? "bg-rule-strong" : "bg-warn"}`}
        />
        {STREAM_WORD[stream]}
      </span>
      <Tooltip.Root>
        <Tooltip.Trigger className="underline decoration-dotted underline-offset-2 hover:text-ink">
          Engine {run.engine}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={6} className="z-50 max-w-xs border border-rule-strong bg-panel px-3 py-2 text-xs leading-relaxed text-ink-2">
            {run.engine === "sovopt-native"
              ? "Native SOV-OPT core. Every iteration, objective and dual value on this page comes from the C++ solver, and the verdict comes from the independent exact-arithmetic verifier."
              : "Preview engine, used for problem classes the native core does not solve yet. Model reading, hashes and hardware data are measured; iteration traces are simulated from the model profile."}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </span>
  );
}

function Summary({ run, d }: { run?: Run; d: Derived }) {
  const mip = d.kind === "MILP" || d.kind === "MIQP";
  const live = run && ["queued", "running"].includes(run.status);
  const objective = live ? (mip ? n(d.latest.incumbent) : n(d.latest.objective)) : run?.objective ?? null;
  const bound = live ? n(d.latest.bound) : run?.bound ?? null;
  const gap = live ? n(d.latest.gap) : run?.gap ?? null;
  const elapsed = live ? d.t : run?.elapsed ?? d.t;
  const work = mip ? n(d.latest.nodes) ?? run?.nodes ?? 0 : n(d.latest.iteration) ?? run?.iterations ?? 0;
  const ref = run?.reference_objective;

  const tiles: { k: string; v: React.ReactNode; sub?: React.ReactNode }[] = [
    { k: mip ? "Incumbent" : "Objective", v: num(objective, 10), sub: ref !== null && ref !== undefined ? `reference ${num(ref, 10)}` : undefined },
    mip
      ? { k: "Best bound", v: num(bound, 10), sub: gap !== null ? `gap ${pct(gap, 3)}` : "gap not yet defined" }
      : { k: "Primal infeasibility", v: sci(n(d.latest.primal_infeasibility) ?? n(d.latest.primal_residual) ?? (run?.status === "completed" ? 0 : null)) },
    { k: "Elapsed", v: seconds(elapsed), sub: run ? `of ${run.config.time_limit}s budget` : undefined },
    { k: mip ? "Nodes" : "Iterations", v: int(work), sub: mip ? `${int(n(d.latest.open_nodes))} open` : undefined },
  ];

  return (
    <div className="mt-6 grid grid-cols-2 gap-6 border-b border-rule pb-6 md:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.k} className="min-w-0">
          <div className="text-xs text-ink-3">{t.k}</div>
          <div className="tabular mt-1 truncate font-mono text-lg text-ink" title={typeof t.v === "string" ? t.v : undefined}>
            {t.v}
          </div>
          {t.sub && <div className="tabular mt-0.5 truncate text-xs text-ink-3">{t.sub}</div>}
        </div>
      ))}
      <div className="min-w-0">
        <div className="text-xs text-ink-3">Verification</div>
        <div className="mt-1.5">
          {run?.verification ? <VerdictBadge verdict={run.verification.verdict} /> : <span className="text-sm text-ink-3">{live ? "After solve" : "n/a"}</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- progress

function Progress({ d, run }: { d: Derived; run?: Run }) {
  const mip = d.kind === "MILP" || d.kind === "MIQP";
  const refObjective = run?.reference_objective ?? null;

  const main = useMemo(() => {
    const series = mip
      ? [
          { name: "Incumbent", type: "line", step: "end", showSymbol: false, data: d.incumbent, lineStyle: { width: 2, color: chartTheme.s1 }, itemStyle: { color: chartTheme.s1 }, endLabel: { show: d.incumbent.length > 0, formatter: "Incumbent", color: chartTheme.ink2, fontSize: 11 } },
          { name: "Best bound", type: "line", showSymbol: false, data: d.bound, lineStyle: { width: 2, color: chartTheme.s2 }, itemStyle: { color: chartTheme.s2 }, endLabel: { show: d.bound.length > 0, formatter: "Bound", color: chartTheme.ink2, fontSize: 11 } },
        ]
      : [{ name: "Objective", type: "line", showSymbol: false, data: d.objective, lineStyle: { width: 2, color: chartTheme.s1 }, itemStyle: { color: chartTheme.s1 } }];
    if (!mip && refObjective !== null) {
      (series[0] as Record<string, unknown>).markLine = {
        silent: true,
        symbol: "none",
        label: { formatter: "Reference", color: chartTheme.ink3, fontSize: 11, position: "insideEndTop" },
        lineStyle: { color: chartTheme.ink3, type: "dashed", width: 1 },
        data: [{ yAxis: refObjective }],
      };
    }
    return {
      grid: { left: 8, right: 72, top: mip ? 36 : 16, bottom: 8, containLabel: true },
      legend: mip ? { top: 0, left: 0, icon: "rect", itemWidth: 12, itemHeight: 3, textStyle: { color: chartTheme.ink2, fontSize: 12 } } : undefined,
      tooltip: baseTooltip({ valueFormatter: (v: number) => num(v, 10) }),
      xAxis: baseAxis({ type: "value", name: "seconds", nameLocation: "end", min: 0, splitLine: { show: false } }),
      yAxis: baseAxis({ type: "value", scale: true, axisLabel: { color: chartTheme.ink3, fontSize: 11, formatter: (v: number) => num(v, 4) } }),
      series,
    };
  }, [d.incumbent, d.bound, d.objective, mip, refObjective]);

  const second = useMemo(() => {
    const data = mip ? d.gap : d.residual;
    // A log axis needs a non-degenerate extent; pin it to whole decades around the data.
    const ys = data.map((p) => p[1]).filter((v) => v > 0);
    const lo = ys.length ? 10 ** Math.floor(Math.log10(Math.min(...ys))) : 1e-6;
    let hi = ys.length ? 10 ** Math.ceil(Math.log10(Math.max(...ys))) : 1;
    if (hi <= lo) hi = lo * 10;
    return {
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      tooltip: baseTooltip({ valueFormatter: (v: number) => (mip ? `${v.toFixed(4)}%` : sci(v)) }),
      xAxis: baseAxis({ type: "value", name: "seconds", min: 0, splitLine: { show: false } }),
      yAxis: baseAxis({ type: "log", min: lo, max: hi, logBase: 10, axisLabel: { color: chartTheme.ink3, fontSize: 11, formatter: (v: number) => (mip ? `${v}%` : sci(v, 0)) } }),
      series: [{ name: mip ? "Relative gap" : d.residualName, type: "line", showSymbol: false, data, lineStyle: { width: 2, color: chartTheme.s1 }, itemStyle: { color: chartTheme.s1 } }],
    };
  }, [d.gap, d.residual, d.residualName, mip]);

  const enough = mip ? d.bound.length >= 2 : d.objective.length >= 2;
  if (!enough) {
    return (
      <Panel className="p-6">
        <div className="text-sm text-ink">{run && run.status !== "queued" && run.status !== "running" ? "No progress was recorded for this run." : "Waiting for the first iterations"}</div>
        <p className="mt-1 text-sm text-ink-3">The model is loaded, presolved and scaled before the solve starts. Those steps appear in the timeline.</p>
        <Skeleton className="mt-6 h-64" />
      </Panel>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-10">
        <figure>
          <figcaption className="mb-2 text-sm font-medium text-ink">
            {mip ? "Incumbent and best bound" : "Objective value"}
          </figcaption>
          <EChart option={main} height={300} label={mip ? "Line chart of incumbent objective and best bound over time" : "Line chart of objective value over time"} />
        </figure>
        <figure>
          <figcaption className="mb-2 text-sm font-medium text-ink">{mip ? "Relative gap, log scale" : `${d.residualName}, log scale`}</figcaption>
          {(mip ? d.gap : d.residual).length >= 2 ? (
            <EChart option={second} height={200} label={mip ? "Relative MIP gap over time" : `${d.residualName} over time`} />
          ) : (
            <p className="py-6 text-sm text-ink-3">{mip ? "The gap is defined once the first incumbent is found." : "Phase 1 has finished; the basis is primal feasible."}</p>
          )}
        </figure>
      </div>
      <aside className="space-y-8">
        {d.decisionReason && (
          <section>
            <h2 className="text-sm font-medium text-ink">Why this algorithm</h2>
            <p className="mt-1.5 text-sm text-ink-2">{d.decisionReason}</p>
          </section>
        )}
        {mip && (
          <section>
            <h2 className="text-sm font-medium text-ink">Decision budget</h2>
            <p className="mt-1 text-xs text-ink-3">When each quality level was first reached.</p>
            <dl className="mt-3">
              {d.budget.map((b) => (
                <div key={b.label} className="flex justify-between border-b border-rule py-2 text-sm last:border-0">
                  <dt className="text-ink-2">{b.label}</dt>
                  <dd className="tabular font-mono text-[13px]">{b.t === null ? <span className="text-ink-3">not reached</span> : seconds(b.t)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {mip && d.incumbent.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-ink">Incumbent sources</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {Object.entries(
                d.milestones
                  .filter((e) => e.type === "INCUMBENT_FOUND")
                  .reduce<Record<string, number>>((acc, e) => {
                    const s = String((e.data as D).source);
                    acc[s] = (acc[s] ?? 0) + 1;
                    return acc;
                  }, {}),
              ).map(([s, c]) => (
                <li key={s} className="flex justify-between">
                  <span className="text-ink-2">{label(s)}</span>
                  <span className="tabular font-mono text-[13px]">{c}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- timeline

function describe(e: SolverEvent): { title: string; detail?: string; tone?: "warn" | "ok" | "risk" } {
  const x = e.data as D;
  switch (e.type) {
    case "RUN_QUEUED": return { title: "Queued" };
    case "RUN_STARTED": return { title: "Worker started", detail: `SOV-OPT ${x.solver_version}` };
    case "MODEL_PROFILING": return { title: "Reading model file" };
    case "MODEL_LOADED": return { title: "Model loaded", detail: `${int(n(x.rows))} rows, ${int(n(x.cols))} columns, ${int(n(x.nnz))} nonzeros` };
    case "SOLVER_DECISION": return { title: `Algorithm selected: ${label(String(x.algorithm))}`, detail: String(x.reason) };
    case "PRESOLVE_COMPLETED": return { title: "Presolve finished", detail: `Rows ${int(n(x.rows_before))} to ${int(n(x.rows_after))}, columns ${int(n(x.cols_before))} to ${int(n(x.cols_after))}` };
    case "SCALING_COMPLETED": return { title: "Scaling applied", detail: `Coefficient span ${x.range_before} to ${x.range_after} orders of magnitude` };
    case "SOLVE_STARTED": return { title: "Solve started", detail: x.method ? String(x.method) : undefined };
    case "PHASE_CHANGE": return { title: "Phase 2", detail: `${x.message} at iteration ${int(n(x.iteration))}` };
    case "FACTORIZATION": return { title: "KKT factorization", detail: `${x.ordering} ordering, ${int(n(x.nnz_factor))} nonzeros in factor` };
    case "ROOT_LP_SOLVED": return { title: "Root relaxation solved", detail: `Bound ${num(n(x.objective), 10)} after ${int(n(x.iterations))} iterations` };
    case "CUT_ROUND": return { title: `Cut round ${x.round}`, detail: `Bound ${num(n(x.bound), 10)}. ${Object.entries(x.cuts as Record<string, number>).map(([k, v]) => `${v} ${label(k).toLowerCase()}`).join(", ")}` };
    case "INCUMBENT_FOUND": return { title: "New incumbent", detail: `${num(n(x.objective), 10)} from ${label(String(x.source)).toLowerCase()} at node ${int(n(x.node))}`, tone: "ok" };
    case "NUMERICAL_EVENT": return { title: x.severity === "warning" ? "Numerical recovery" : "Numerical note", detail: String(x.message), tone: "warn" };
    case "SOLVE_COMPLETED": return { title: `Solve finished: ${label(String(x.status))}`, detail: x.objective !== null && x.objective !== undefined ? `Objective ${num(n(x.objective), 10)}` : undefined };
    case "VERIFICATION_STARTED": return { title: "Independent verification started" };
    case "VERIFICATION_COMPLETED": return { title: `Verification: ${label(String(x.verdict))}`, tone: "ok" };
    case "RUN_COMPLETED": return { title: "Run completed" };
    case "RUN_CANCELLED": return { title: "Run stopped by user" };
    case "RUN_FAILED": return { title: "Run failed", detail: String(x.message), tone: "risk" };
    default: return { title: label(e.type) };
  }
}

function Timeline({ events }: { events: SolverEvent[] }) {
  if (!events.length) return <Skeleton className="h-64" />;
  return (
    <ol className="relative max-w-3xl">
      {events.map((e) => {
        const { title, detail, tone } = describe(e);
        return (
          <li key={e.seq} className="grid grid-cols-[72px_16px_1fr] gap-3">
            <span className="tabular pt-0.5 text-right font-mono text-xs text-ink-3">{e.t.toFixed(2)}s</span>
            <span className="relative flex justify-center">
              <span className="absolute top-0 bottom-0 w-px bg-rule" aria-hidden />
              <span
                aria-hidden
                className={`relative mt-1.5 h-2 w-2 rounded-full ${tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "risk" ? "bg-risk" : "bg-ink-3"}`}
              />
            </span>
            <div className="pb-5">
              <div className="text-sm text-ink">{title}</div>
              {detail && <div className="mt-0.5 text-sm text-ink-3">{detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- numerics

function Numerics({ d }: { d: Derived }) {
  const reductions = (d.presolve?.reductions as { rule: string; count: number }[] | undefined) ?? [];
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section>
        <h2 className="text-sm font-medium text-ink">Presolve reductions</h2>
        {d.presolve ? (
          <>
            <p className="tabular mt-1 text-sm text-ink-3">
              {int(n(d.presolve.rows_before))} to {int(n(d.presolve.rows_after))} rows, {int(n(d.presolve.cols_before))} to{" "}
              {int(n(d.presolve.cols_after))} columns
            </p>
            <dl className="mt-3">
              {reductions.map((r) => (
                <div key={r.rule} className="flex justify-between border-b border-rule py-2 text-sm last:border-0">
                  <dt className="text-ink-2">{label(r.rule)}</dt>
                  <dd className="tabular font-mono text-[13px]">{int(r.count)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-3">Presolve has not reported yet, or was switched off for this run.</p>
        )}
      </section>
      <section>
        <h2 className="text-sm font-medium text-ink">Scaling</h2>
        {d.scaling ? (
          <dl className="mt-3">
            <div className="flex justify-between border-b border-rule py-2 text-sm">
              <dt className="text-ink-2">Method</dt>
              <dd>{String(d.scaling.method)}</dd>
            </div>
            <div className="flex justify-between border-b border-rule py-2 text-sm">
              <dt className="text-ink-2">Coefficient span before</dt>
              <dd className="tabular font-mono text-[13px]">{String(d.scaling.range_before)} orders</dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-ink-2">Coefficient span after</dt>
              <dd className="tabular font-mono text-[13px]">{String(d.scaling.range_after)} orders</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-ink-3">No scaling report yet.</p>
        )}
        <h2 className="mt-8 text-sm font-medium text-ink">Numerical events</h2>
        {d.numerical.length ? (
          <ul className="mt-3 space-y-3">
            {d.numerical.map((e) => (
              <li key={e.seq} className="border-l-2 border-warn pl-3 text-sm">
                <div className="text-ink">{String((e.data as D).message)}</div>
                <div className="tabular mt-0.5 text-xs text-ink-3">
                  at {e.t.toFixed(2)}s · action {String((e.data as D).action)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-3">No numerical difficulties were reported.</p>
        )}
      </section>
    </div>
  );
}

// --------------------------------------------------------------------- gpu

function GpuTab({ d, run }: { d: Derived; run?: Run }) {
  const opt = useMemo(
    () => ({
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      tooltip: baseTooltip({ valueFormatter: (v: number) => `${v.toFixed(1)}%` }),
      xAxis: baseAxis({ type: "value", name: "seconds", min: 0, splitLine: { show: false } }),
      yAxis: baseAxis({ type: "value", min: 0, max: 100, axisLabel: { color: chartTheme.ink3, fontSize: 11, formatter: "{value}%" } }),
      series: [{ name: "GPU utilization", type: "line", showSymbol: false, data: d.gpu.map((g) => [g.t, g.utilization]), lineStyle: { width: 2, color: chartTheme.s1 }, itemStyle: { color: chartTheme.s1 }, areaStyle: { color: "rgba(28,92,171,0.08)" } }],
    }),
    [d.gpu],
  );
  if (run && !run.config.gpu) {
    return <EmptyState title="GPU acceleration was off for this run" message="Start a new run with GPU acceleration enabled to record kernel and transfer timings." />;
  }
  if (d.gpu.length < 2) return <Skeleton className="h-56" />;
  const kernel = d.gpu.reduce((s, g) => s + g.kernel_ms, 0);
  const h2d = d.gpu.reduce((s, g) => s + g.h2d_ms, 0);
  const d2h = d.gpu.reduce((s, g) => s + g.d2h_ms, 0);
  const avg = d.gpu.reduce((s, g) => s + g.utilization, 0) / d.gpu.length;
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
      <figure className="min-w-0">
        <figcaption className="mb-2 text-sm font-medium text-ink">GPU utilization during the solve</figcaption>
        <EChart option={opt} height={240} label="GPU utilization over time" />
      </figure>
      <dl>
        {[
          ["Average utilization", `${avg.toFixed(1)}%`],
          ["Kernel time", seconds(kernel / 1000)],
          ["Host to device", seconds(h2d / 1000)],
          ["Device to host", seconds(d2h / 1000)],
          ["Samples", int(d.gpu.length)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-rule py-2 text-sm last:border-0">
            <dt className="text-ink-2">{k}</dt>
            <dd className="tabular font-mono text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------- evidence

function Evidence({ run }: { run?: Run }) {
  const done = run && !["queued", "running"].includes(run.status);
  const passport = useQuery({ queryKey: ["passport", run?.id], queryFn: () => api.passport(run!.id), enabled: !!done });
  if (!done) {
    return <EmptyState title="Evidence is issued when the run finishes" message="The passport records the model hash, configuration, hardware, result and verification verdict." />;
  }
  if (passport.isError) return <ErrorState message={(passport.error as Error).message} />;
  if (!passport.data) return <Skeleton className="h-72" />;
  const p = passport.data as D;
  const model = p.model as D;
  const hw = p.hardware as D;
  const v = run.verification as Verification | null;
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-medium text-ink">Optimization passport</h2>
          <p className="mt-1 text-sm text-ink-3">
            A portable record of what ran, where, with which settings, and what the verifier concluded.
          </p>
          <dl className="mt-4">
            {[
              ["Model SHA-256", <span key="h" className="break-all">{String(model.sha256)}</span>],
              ["Configuration SHA-256", <span key="c" className="break-all">{String(p.configuration_sha256)}</span>],
              ["Trace SHA-256", <span key="t" className="break-all">{String((p.artifacts as D)["trace.jsonl"])}</span>],
              ["Hardware", `${hw.cpu}${hw.gpu ? ` · ${hw.gpu}` : ""}`],
              ["Seed", String(p.random_seed)],
              ["Deterministic", p.deterministic ? "yes" : "no"],
            ].map(([k, val]) => (
              <div key={String(k)} className="grid grid-cols-[150px_1fr] gap-4 border-b border-rule py-2 text-sm last:border-0">
                <dt className="text-ink-2">{k}</dt>
                <dd className="font-mono text-[12px] text-ink">{val}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="flex flex-wrap gap-2">
          <a href={api.evidenceUrl(run.id)} download className="inline-flex h-10 items-center rounded-[3px] border border-accent bg-accent px-4 text-sm font-medium text-[#f6f5f1] hover:bg-accent-ink">
            Download evidence bundle
          </a>
        </div>
        <p className="text-xs text-ink-3">
          The bundle contains passport.json, configuration.json, the full event trace, the verification report and the model profile.
        </p>
      </div>
      <section>
        <h2 className="text-sm font-medium text-ink">Verification checks</h2>
        {v ? (
          <>
            <div className="mt-2">
              <VerdictBadge verdict={v.verdict} />
              {v.precision && <span className="ml-2 text-xs text-ink-3">computed in {v.precision}</span>}
            </div>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-ink-3">
                  <th className="py-2 font-medium">Check</th>
                  <th className="py-2 text-right font-medium">Measured</th>
                  <th className="py-2 text-right font-medium">Tolerance</th>
                  <th className="py-2 text-right font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {v.checks.map((c) => (
                  <tr key={c.check} className="border-b border-rule last:border-0">
                    <td className="py-2 text-ink-2">{label(c.check)}</td>
                    <td className="tabular py-2 text-right font-mono text-[13px]">{sci(c.value)}</td>
                    <td className="tabular py-2 text-right font-mono text-[13px] text-ink-3">{sci(c.tolerance, 0)}</td>
                    <td className="py-2 text-right">{c.passed ? <Badge tone="ok" glyph>Pass</Badge> : <Badge tone="risk" glyph>Fail</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-3">This run ended before verification.</p>
        )}
      </section>
    </div>
  );
}
