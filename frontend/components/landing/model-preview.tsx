"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { int, sci } from "@/lib/format";
import { SparsityPlot } from "@/components/sparsity-plot";
import { Skeleton } from "@/components/ui";

export function ModelPreview({ collection, name }: { collection: string; name: string }) {
  const q = useQuery({
    queryKey: ["analysis", collection, name],
    queryFn: () => api.analysis(collection, name),
    refetchInterval: (query) => (query.state.data?.state === "ready" ? false : 1500),
  });

  const a = q.data?.analysis;

  if (q.isError) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center border border-rule bg-panel p-6 text-center text-sm text-ink-3">
        The live model preview appears here when the SOV-OPT service is running.
      </div>
    );
  }

  if (!a) {
    return (
      <div className="border border-rule bg-panel p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-5 aspect-[5/2] w-full" />
        <div className="mt-5 grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    );
  }

  const span = a.coef_min && a.coef_max ? Math.log10(a.coef_max / a.coef_min) : null;

  return (
    <div className="fade-in border border-rule bg-panel">
      <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3">
        <div className="text-sm">
          <span className="text-ink-3">Model Studio</span>
          <span className="mx-2 text-rule-strong">/</span>
          <span className="font-medium text-ink">{a.name}</span>
        </div>
        <Link href={`/models/${collection}/${name}`} className="text-sm text-accent hover:text-accent-ink">
          Open model
        </Link>
      </div>
      <div className="p-5">
        <SparsityPlot sparsity={a.sparsity} modelRows={a.rows} modelCols={a.cols} />
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-3">Constraints</dt>
            <dd className="tabular mt-1 font-mono text-lg">{int(a.rows)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Variables</dt>
            <dd className="tabular mt-1 font-mono text-lg">{int(a.cols)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Nonzeros</dt>
            <dd className="tabular mt-1 font-mono text-lg">{int(a.nnz)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Coefficient span</dt>
            <dd className="tabular mt-1 font-mono text-lg">
              {span !== null ? `${span.toFixed(1)} orders` : "n/a"}
            </dd>
            {a.coef_min !== null && (
              <dd className="tabular text-xs text-ink-3">
                {sci(a.coef_min)} to {sci(a.coef_max)}
              </dd>
            )}
          </div>
        </dl>
      </div>
    </div>
  );
}
