"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import { api, type Analysis, type ModelDetail } from "@/lib/api";
import { bytes, int, num, pct, reference, sci } from "@/lib/format";
import { PageHeader } from "@/components/platform/shell";
import { NewRunDialog, RunsTable } from "@/components/platform/runs";
import { SparsityPlot } from "@/components/sparsity-plot";
import { CoefHistogram } from "@/components/charts/coef-histogram";
import { Badge, Button, EmptyState, ErrorState, Panel, Skeleton, healthWord } from "@/components/ui";

const TABS = [
  { id: "structure", label: "Structure" },
  { id: "health", label: "Health" },
  { id: "runs", label: "Runs" },
];

export function ModelStudioView({ collection, name }: { collection: string; name: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = sp.get("tab") ?? "structure";

  const model = useQuery({
    queryKey: ["model", collection, name],
    queryFn: () => api.model(collection, name),
    refetchInterval: 5000,
  });
  const analysis = useQuery({
    queryKey: ["analysis", collection, name],
    queryFn: () => api.analysis(collection, name),
    refetchInterval: (q) => {
      const s = q.state.data?.state;
      return s === "ready" || s === "unavailable" || s === "failed" ? false : 1000;
    },
  });
  const fp = useQuery({
    queryKey: ["fingerprint", collection, name],
    queryFn: () => api.fingerprint(collection, name),
    enabled: !!model.data?.analyzable,
    staleTime: Infinity,
  });

  if (model.isError) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorState
          title="Model not available"
          message={(model.error as Error).message}
          action={<Link href="/models" className="text-sm text-accent">Back to models</Link>}
        />
      </div>
    );
  }

  const m = model.data;
  const a = analysis.data?.analysis ?? null;
  const state = analysis.data?.state;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <Link href={`/models?collection=${collection}`} className="hover:text-ink">
            {m?.collection_title ?? collection}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {a?.name ?? name}
            {m && <Badge>{a?.kind ?? m.kind}</Badge>}
            {a && (
              <Badge tone={a.health_status} glyph>
                {healthWord[a.health_status]}
              </Badge>
            )}
          </span>
        }
        description={
          m ? (
            <span className="tabular">
              {int(a?.rows ?? m.rows)} constraints · {int(a?.cols ?? m.cols)} variables · {int(a?.nnz ?? m.nnz)} nonzeros
              {a && ` · ${a.sense === "MAX" ? "maximize" : "minimize"}`}
            </span>
          ) : (
            <Skeleton className="h-4 w-72" />
          )
        }
        actions={
          m?.analyzable ? (
            <NewRunDialog collection={collection} name={name} kind={a?.kind ?? m.kind}>
              <Button>Solve this model</Button>
            </NewRunDialog>
          ) : undefined
        }
      />

      {m && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-ink-3">
          <div className="flex gap-2">
            <dt>File</dt>
            <dd className="text-ink-2">{bytes(m.size_bytes)}</dd>
          </div>
          {m.reference_status && m.reference_status !== "unkn" && (
            <div className="flex gap-2">
              <dt>{m.reference_status === "best" ? "Best known objective" : "Reference"}</dt>
              <dd className="tabular font-mono text-ink-2" title={m.reference_source ?? undefined}>
                {reference(m.reference_status === "best" ? "opt" : m.reference_status, m.reference_objective, 11)}
              </dd>
              <dd className="text-ink-3">{m.reference_source}</dd>
            </div>
          )}
          {fp.data && (
            <div className="flex min-w-0 gap-2">
              <dt>SHA-256</dt>
              <dd className="truncate font-mono text-ink-2" title={fp.data.sha256}>
                {fp.data.sha256.slice(0, 16)}
              </dd>
            </div>
          )}
        </dl>
      )}

      {state === "unavailable" && m ? (
        <MetadataOnly m={m} />
      ) : state === "failed" ? (
        <div className="mt-8">
          <ErrorState title="The model file could not be read" message={analysis.data?.error ?? "The profiler rejected this file."} />
        </div>
      ) : !a ? (
        <div className="mt-8">
          <Panel className="p-6">
            <div className="text-sm text-ink">Reading the model file</div>
            <p className="tabular mt-1 text-sm text-ink-3">
              {analysis.data?.lines ? `${int(analysis.data.lines)} lines parsed` : "Parsing rows, columns and bounds"}
            </p>
            <Skeleton className="mt-6 aspect-[5/2] w-full" />
          </Panel>
        </div>
      ) : (
        <Tabs.Root
          value={tab}
          onValueChange={(v) => router.replace(`${path}${v === "structure" ? "" : `?tab=${v}`}`, { scroll: false })}
          className="mt-6"
        >
          <Tabs.List aria-label="Model views" className="flex gap-1 border-b border-rule">
            {TABS.map((t) => (
              <Tabs.Trigger
                key={t.id}
                value={t.id}
                className="-mb-px border-b-2 border-transparent px-3 pb-2.5 text-sm text-ink-2 hover:text-ink data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink"
              >
                {t.label}
                {t.id === "health" && a.health.some((h) => h.status === "warn" || h.status === "risk") && (
                  <span className="tabular ml-1.5 text-xs text-warn">
                    {a.health.filter((h) => h.status === "warn" || h.status === "risk").length}
                  </span>
                )}
                {t.id === "runs" && m && m.runs.length > 0 && (
                  <span className="tabular ml-1.5 text-xs text-ink-3">{m.runs.length}</span>
                )}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="structure" className="pt-6 focus:outline-none">
            <Structure a={a} />
          </Tabs.Content>
          <Tabs.Content value="health" className="pt-6 focus:outline-none">
            <Health a={a} />
          </Tabs.Content>
          <Tabs.Content value="runs" className="pt-6 focus:outline-none">
            {m && m.runs.length ? (
              <RunsTable runs={m.runs} showModel={false} />
            ) : (
              <EmptyState
                title="This model has not been solved yet"
                message="Start a run to see live progress, verification and an evidence bundle."
                action={
                  m && (
                    <NewRunDialog collection={collection} name={name} kind={a.kind}>
                      <Button>Solve this model</Button>
                    </NewRunDialog>
                  )
                }
              />
            )}
          </Tabs.Content>
        </Tabs.Root>
      )}
    </div>
  );
}

function Row({ k, v, sub }: { k: string; v: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2 last:border-0">
      <dt className="text-sm text-ink-2">{k}</dt>
      <dd className="tabular text-right font-mono text-[13px] text-ink">
        {v}
        {sub && <span className="ml-2 font-sans text-xs text-ink-3">{sub}</span>}
      </dd>
    </div>
  );
}

function Structure({ a }: { a: Analysis }) {
  return (
    <div className="space-y-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <h2 className="mb-3 text-sm font-medium text-ink">Constraint matrix</h2>
          <SparsityPlot sparsity={a.sparsity} modelRows={a.rows} modelCols={a.cols} />
        </div>
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-medium text-ink">Constraints</h2>
            <dl className="mt-2">
              <Row k="Equality" v={int(a.row_types.E)} />
              <Row k="Less or equal" v={int(a.row_types.L)} />
              <Row k="Greater or equal" v={int(a.row_types.G)} />
              {a.ranges > 0 && <Row k="Ranged" v={int(a.ranges)} />}
            </dl>
          </section>
          <section>
            <h2 className="text-sm font-medium text-ink">Variables</h2>
            <dl className="mt-2">
              <Row k="Continuous" v={int(a.continuous_cols)} />
              {a.integer_cols > 0 && <Row k="Integer" v={int(a.integer_cols - a.binary_cols)} />}
              {a.integer_cols > 0 && <Row k="Binary" v={int(a.binary_cols)} />}
              <Row k="Free" v={int(a.free_cols)} />
              <Row k="Fixed" v={int(a.fixed_cols)} />
            </dl>
          </section>
          <section>
            <h2 className="text-sm font-medium text-ink">Objective</h2>
            <dl className="mt-2">
              <Row k="Linear terms" v={int(a.objective_nnz)} />
              {a.quadratic_nnz > 0 && <Row k="Quadratic terms" v={int(a.quadratic_nnz)} sub={`${int(a.quadratic_diag)} diagonal`} />}
              <Row k="Sense" v={a.sense === "MAX" ? "maximize" : "minimize"} />
            </dl>
          </section>
        </div>
      </div>

      <div className="grid gap-10 border-t border-rule pt-8 lg:grid-cols-2">
        <CoefHistogram data={a.coef_hist} title="Coefficient magnitudes" />
        <section>
          <h2 className="mb-3 text-sm font-medium text-ink">Density and ranges</h2>
          <dl>
            <Row k="Density" v={pct(a.density, 4)} />
            <Row k="Nonzeros per row" v={a.row_nnz_avg.toFixed(1)} sub={`max ${int(a.row_nnz_max)}`} />
            <Row k="Nonzeros per column" v={a.col_nnz_avg.toFixed(1)} sub={`max ${int(a.col_nnz_max)}`} />
            <Row k="Matrix |a|" v={`${sci(a.coef_min)} to ${sci(a.coef_max)}`} />
            <Row k="Objective |c|" v={`${sci(a.obj_min)} to ${sci(a.obj_max)}`} />
            <Row k="Right-hand side |b|" v={`${sci(a.rhs_min)} to ${sci(a.rhs_max)}`} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function Health({ a }: { a: Analysis }) {
  const order = { risk: 0, warn: 1, info: 2, ok: 3 } as const;
  const items = [...a.health].sort((x, y) => order[x.status] - order[y.status]);
  return (
    <div>
      <p className="max-w-2xl text-sm text-ink-2">
        Each finding comes from a statistic measured on the model file. Nothing here is estimated by a learned score.
      </p>
      <ul className="mt-6 divide-y divide-rule border-y border-rule">
        {items.map((h) => (
          <li key={h.key} className="grid gap-2 py-4 md:grid-cols-[220px_140px_1fr] md:gap-6">
            <div>
              <div className="text-sm font-medium text-ink">{h.label}</div>
              <div className="mt-1">
                <Badge tone={h.status} glyph>
                  {healthWord[h.status]}
                </Badge>
              </div>
            </div>
            <div className="tabular font-mono text-sm text-ink">{h.value}</div>
            <div>
              <p className="text-sm text-ink-2">{h.detail}</p>
              <p className="mt-1 text-xs text-ink-3">Measured: {h.statistic}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetadataOnly({ m }: { m: ModelDetail }) {
  const meta = m.meta;
  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
      <Panel className="p-6">
        <h2 className="text-sm font-medium text-ink">Published structure</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-3">
          This instance is stored in the QPLIB format. Its structure below comes from the QPLIB instance table. The matrix
          view opens once the QPLIB reader lands in the solver.
        </p>
        <dl className="mt-5 max-w-lg">
          <Row k="Constraints" v={int(m.rows)} />
          <Row k="Variables" v={int(m.cols)} />
          <Row k="Integer variables" v={int(m.integer_cols)} />
          <Row k="Nonzeros" v={int(m.nnz)} />
          <Row k="Quadratic objective terms" v={int(Number(meta.objquadnz))} />
          <Row k="Objective curvature" v={String(meta.objcurvature)} />
          <Row k="Convex" v={meta.convex ? "yes" : "no"} />
          <Row k="QPLIB class" v={String(meta.probtype)} />
          <Row k="Sense" v={String(meta.objsense)} />
        </dl>
      </Panel>
      <Panel className="p-6">
        <h2 className="text-sm font-medium text-ink">Best known objective</h2>
        <div className="tabular mt-3 font-mono text-2xl">{num(m.reference_objective, 10)}</div>
        <p className="mt-2 text-xs text-ink-3">{m.reference_source ?? "No published value"}</p>
        {meta.donor && <p className="mt-4 text-xs text-ink-3">Contributed by {String(meta.donor)}</p>}
      </Panel>
    </div>
  );
}
