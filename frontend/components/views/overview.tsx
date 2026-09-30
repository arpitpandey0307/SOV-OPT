"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { bytes, int } from "@/lib/format";
import { PageHeader } from "@/components/platform/shell";
import { RunsTable } from "@/components/platform/runs";
import { ButtonLink, EmptyState, ErrorState, Panel, SectionHeading, Skeleton, Stat } from "@/components/ui";

export function OverviewView() {
  const ov = useQuery({ queryKey: ["overview"], queryFn: api.overview, refetchInterval: 4000 });
  const sys = useQuery({ queryKey: ["system"], queryFn: api.system, refetchInterval: 5000 });

  const cols = ov.data?.collections ?? [];
  const total = cols.reduce((s, c) => s + c.count, 0);
  const profiled = cols.reduce((s, c) => s + c.analyzed, 0);
  const counts = ov.data?.run_counts ?? {};
  const finished = (counts.completed ?? 0) + (counts.cancelled ?? 0) + (counts.failed ?? 0);
  const gpu = sys.data?.gpus[0];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Workspace"
        title="Overview"
        description="Models available to this workspace, the runs executed against them, and the hardware the solver is using."
        actions={
          <>
            <ButtonLink href="/models" variant="secondary">
              Browse models
            </ButtonLink>
            <ButtonLink href="/models?upload=1">Upload a model</ButtonLink>
          </>
        }
      />

      {ov.isError ? (
        <div className="mt-8">
          <ErrorState title="Workspace data unavailable" message={(ov.error as Error).message} />
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-6 border-b border-rule pb-8 md:grid-cols-4">
            {ov.data ? (
              <>
                <Stat label="Models in catalog" value={int(total)} sub={`${cols.length} collections`} />
                <Stat label="Profiled" value={int(profiled)} sub="structure and health read" />
                <Stat label="Runs finished" value={int(finished)} sub={`${int(counts.completed ?? 0)} completed`} />
                <Stat label="Active runs" value={int(ov.data.active_runs)} sub={ov.data.active_runs ? "streaming now" : "worker idle"} />
              </>
            ) : (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)
            )}
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-10">
              <section>
                <SectionHeading
                  title="Recent runs"
                  actions={
                    <Link href="/runs" className="text-sm text-accent hover:text-accent-ink">
                      All runs
                    </Link>
                  }
                />
                <div className="mt-4">
                  {!ov.data ? (
                    <Skeleton className="h-48" />
                  ) : ov.data.recent_runs.length ? (
                    <RunsTable runs={ov.data.recent_runs} />
                  ) : (
                    <EmptyState
                      title="No runs yet"
                      message="Open a model, review its health report, then start a run. Progress streams here live."
                      action={<ButtonLink href="/models/netlib/afiro">Start with AFIRO</ButtonLink>}
                    />
                  )}
                </div>
              </section>

              <section>
                <SectionHeading title="Collections" description="Benchmark sets read from the local dataset directory." />
                <div className="mt-4 overflow-x-auto border border-rule bg-panel">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-rule text-left text-xs text-ink-3">
                        <th className="px-4 py-2.5 font-medium">Collection</th>
                        <th className="px-4 py-2.5 font-medium">Type</th>
                        <th className="px-4 py-2.5 text-right font-medium">Models</th>
                        <th className="px-4 py-2.5 text-right font-medium">Profiled</th>
                        <th className="px-4 py-2.5 text-right font-medium">With reference</th>
                        <th className="px-4 py-2.5 text-right font-medium">On disk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!ov.data
                        ? [0, 1, 2, 3].map((i) => (
                            <tr key={i}>
                              <td colSpan={6} className="px-4 py-2.5">
                                <Skeleton className="h-5" />
                              </td>
                            </tr>
                          ))
                        : cols.map((c) => (
                            <tr key={c.id} className="border-b border-rule last:border-0">
                              <td className="px-4 py-2.5">
                                <Link href={`/models?collection=${c.id}`} className="text-ink hover:text-accent">
                                  {c.title}
                                </Link>
                              </td>
                              <td className="px-4 py-2.5 text-ink-2">{c.kind}</td>
                              <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{int(c.count)}</td>
                              <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">
                                {c.id === "qplib" ? "metadata" : int(c.analyzed)}
                              </td>
                              <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{int(c.with_reference)}</td>
                              <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{bytes(c.size_bytes)}</td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <Panel className="p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold">Compute</h2>
                  <Link href="/system" className="text-xs text-accent hover:text-accent-ink">
                    GPU observatory
                  </Link>
                </div>
                {sys.data ? (
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-ink-3">GPU</dt>
                      <dd className="text-ink">{gpu?.name ?? "No CUDA device detected"}</dd>
                      {gpu && (
                        <dd className="tabular text-xs text-ink-3">
                          {int(gpu.memory_total_mb)} MB · driver {gpu.driver}
                        </dd>
                      )}
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">CPU</dt>
                      <dd className="text-ink">{sys.data.host.cpu}</dd>
                      <dd className="text-xs text-ink-3">
                        {sys.data.host.logical_cores} logical cores · {bytes(sys.data.host.memory_bytes)} memory
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Solver</dt>
                      <dd className="text-ink">SOV-OPT {sys.data.solver_version}</dd>
                    </div>
                  </dl>
                ) : (
                  <div className="mt-4 space-y-3">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                )}
              </Panel>

              <Panel className="p-5">
                <h2 className="text-sm font-semibold">Start here</h2>
                <ol className="mt-3 space-y-3 text-sm text-ink-2">
                  <li>
                    <span className="font-mono text-xs text-ink-3">1</span>{" "}
                    <Link href="/models/miplib2017/glass4" className="text-accent hover:text-accent-ink">
                      Open glass4
                    </Link>{" "}
                    and read its health report. It has large big-M constants.
                  </li>
                  <li>
                    <span className="font-mono text-xs text-ink-3">2</span> Start a run with a 30 second budget and watch the
                    bound and incumbent close.
                  </li>
                  <li>
                    <span className="font-mono text-xs text-ink-3">3</span> Download the evidence bundle from the finished run.
                  </li>
                </ol>
              </Panel>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
