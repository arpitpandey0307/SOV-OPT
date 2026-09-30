"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ModelSummary, type Run } from "@/lib/api";
import { compact, int, num, reference, relError, sci, seconds } from "@/lib/format";
import { PageHeader } from "@/components/platform/shell";
import { RunStatusBadge, VerdictBadge } from "@/components/platform/runs";
import { Badge, Button, ErrorState, Skeleton, Stat } from "@/components/ui";

interface Suite {
  id: string;
  collection: string;
  title: string;
  description: string;
  select: (m: ModelSummary) => boolean;
  timeLimit: number;
}

const SUITES: Suite[] = [
  {
    id: "netlib",
    collection: "netlib",
    title: "Netlib LP",
    description: "Classic LPs with optimal objectives published in the Netlib readme. Includes the degenerate DEGEN models and the ill-conditioned PILOT family.",
    select: () => true,
    timeLimit: 60,
  },
  {
    id: "miplib-easy",
    collection: "miplib2017",
    title: "MIPLIB 2017, solved subset",
    description: "Benchmark instances with a proven optimum and at most 60,000 nonzeros.",
    select: (m) => m.reference_status === "opt" && (m.nnz ?? Infinity) <= 60_000,
    timeLimit: 60,
  },
  {
    id: "miplib-hard",
    collection: "miplib2017",
    title: "MIPLIB 2017, open and infeasible",
    description: "Instances with only a best-known value, or proven infeasible. These test gap reporting and infeasibility detection.",
    select: (m) => m.reference_status === "best" || m.reference_status === "inf",
    timeLimit: 60,
  },
];

/** Shifted geometric mean with a 10 second shift, the convention used in public solver benchmarks. */
function sgm(times: number[], shift = 10) {
  if (!times.length) return null;
  const s = times.reduce((acc, t) => acc + Math.log(t + shift), 0);
  return Math.exp(s / times.length) - shift;
}

export function BenchmarksView() {
  const [suiteId, setSuiteId] = useState("netlib");
  const suite = SUITES.find((s) => s.id === suiteId)!;
  const qc = useQueryClient();

  const models = useQuery({
    queryKey: ["models", "bench", suite.collection],
    queryFn: () => api.models({ collection: suite.collection, limit: 500 }),
  });
  const runs = useQuery({
    queryKey: ["runs", "bench", suite.collection],
    queryFn: () => api.runs({ collection: suite.collection, limit: 500 }),
    refetchInterval: 3000,
  });

  const members = useMemo(() => (models.data?.items ?? []).filter(suite.select), [models.data, suite]);
  const latest = useMemo(() => {
    const map = new Map<string, Run>();
    for (const r of runs.data ?? []) if (!map.has(r.instance)) map.set(r.instance, r);
    return map;
  }, [runs.data]);

  const rows = members.map((m) => {
    const r = latest.get(m.name);
    const err = r && m.reference_status === "opt" ? relError(r.objective, m.reference_objective) : null;
    return { m, r, err };
  });
  const finished = rows.filter((x) => x.r && x.r.status === "completed");
  const matched = finished.filter((x) =>
    x.m.reference_status === "inf" ? x.r!.result_status === "INFEASIBLE" : x.err !== null && x.err <= 1e-6,
  );
  const active = rows.filter((x) => x.r && ["queued", "running"].includes(x.r.status)).length;
  const mean = sgm(finished.map((x) => x.r!.elapsed));

  const runSuite = useMutation({
    mutationFn: async () => {
      for (const m of members.slice(0, 40)) {
        await api.createRun(m.collection, m.name, { time_limit: suite.timeLimit, seed: 42, gpu: true });
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Research lab"
        title="Benchmarks"
        description="Each benchmark instance is solved and the result compared with its published reference value. Times are summarized as a shifted geometric mean with a 10 second shift."
      />

      <div className="mt-6 flex flex-wrap gap-x-1 border-b border-rule" role="tablist" aria-label="Benchmark suites">
        {SUITES.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === suiteId}
            onClick={() => setSuiteId(s.id)}
            className={`-mb-px border-b-2 px-3 pb-2.5 text-sm ${
              s.id === suiteId ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-ink-2">{suite.description}</p>
        <Button onClick={() => runSuite.mutate()} disabled={runSuite.isPending || !members.length || active > 0}>
          {runSuite.isPending ? "Queuing runs" : active ? `${active} runs in progress` : `Run ${Math.min(members.length, 40)} instances`}
        </Button>
      </div>
      {runSuite.isError && <p role="alert" className="mt-2 text-sm text-risk">{(runSuite.error as Error).message}</p>}

      <div className="mt-6 grid grid-cols-2 gap-6 border-b border-rule pb-6 md:grid-cols-4">
        <Stat label="Instances" value={models.data ? int(members.length) : "n/a"} />
        <Stat label="Solved" value={int(finished.length)} sub={`of ${int(members.length)}`} />
        <Stat
          label="Matched reference"
          value={int(matched.length)}
          sub="relative error at most 1e-6, or infeasibility confirmed"
        />
        <Stat label="Shifted geometric mean" value={mean === null ? "n/a" : seconds(mean)} sub="over solved instances" />
      </div>

      {finished.some((x) => x.r!.engine === "sovopt-preview") && (
        <p className="mt-4 max-w-3xl border-l-2 border-warn pl-3 text-xs leading-relaxed text-ink-2">
          Results from the sovopt-preview engine. Model reading and verification bookkeeping are real, but iteration traces
          are simulated and converge to the published reference. These rows exercise the benchmark pipeline; they are not
          measurements of solver performance.
        </p>
      )}

      <div className="mt-6">
        {models.isError || runs.isError ? (
          <ErrorState message={((models.error ?? runs.error) as Error).message} />
        ) : !models.data ? (
          <Skeleton className="h-80" />
        ) : (
          <div className="overflow-x-auto border border-rule bg-panel">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-ink-3">
                  <th className="px-4 py-2.5 font-medium">Instance</th>
                  <th className="px-4 py-2.5 text-right font-medium">Nonzeros</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reference</th>
                  <th className="px-4 py-2.5 text-right font-medium">SOV-OPT</th>
                  <th className="px-4 py-2.5 text-right font-medium">Rel. error</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Verification</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ m, r, err }) => (
                  <tr key={m.name} className="border-b border-rule whitespace-nowrap last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/models/${m.collection}/${m.name}`} className="font-medium text-ink hover:text-accent">
                        {m.name}
                      </Link>
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{compact(m.nnz)}</td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">
                      {reference(m.reference_status, m.reference_objective, 10)}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">
                      {r ? (
                        <Link href={`/runs/${r.id}`} className="hover:text-accent">
                          {r.result_status === "INFEASIBLE" ? "infeasible" : num(r.objective, 10)}
                        </Link>
                      ) : (
                        <span className="text-ink-3">not run</span>
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">
                      {err === null ? (
                        <span className="text-ink-3">n/a</span>
                      ) : err <= 1e-6 ? (
                        <span className="text-ok">{sci(err, 1)}</span>
                      ) : (
                        <span className="text-warn">{sci(err, 1)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{r ? <RunStatusBadge run={r} /> : <Badge>Pending</Badge>}</td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{r ? seconds(r.elapsed) : ""}</td>
                    <td className="px-4 py-2.5">{r?.verification ? <VerdictBadge verdict={r.verification.verdict} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
