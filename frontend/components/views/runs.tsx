"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Run } from "@/lib/api";
import { PageHeader } from "@/components/platform/shell";
import { RunsTable } from "@/components/platform/runs";
import { ButtonLink, EmptyState, ErrorState, Skeleton } from "@/components/ui";

const FILTERS: { id: string; label: string; test: (r: Run) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "active", label: "Active", test: (r) => r.status === "queued" || r.status === "running" },
  { id: "optimal", label: "Optimal", test: (r) => r.result_status === "OPTIMAL" },
  { id: "limit", label: "Time limit", test: (r) => (r.result_status ?? "").startsWith("TIME_LIMIT") },
  { id: "stopped", label: "Stopped or failed", test: (r) => r.status === "cancelled" || r.status === "failed" },
];

export function RunsView() {
  const [filter, setFilter] = useState("all");
  const q = useQuery({ queryKey: ["runs", "all"], queryFn: () => api.runs({ limit: 200 }), refetchInterval: 3000 });
  const f = FILTERS.find((x) => x.id === filter)!;
  const rows = q.data?.filter(f.test) ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Workspace"
        title="Runs"
        description="Every solve executed in this workspace, newest first. Open a run to replay its timeline and download its evidence."
      />
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter runs">
        {FILTERS.map((x) => {
          const count = q.data?.filter(x.test).length;
          return (
            <button
              key={x.id}
              onClick={() => setFilter(x.id)}
              aria-pressed={filter === x.id}
              className={`h-8 rounded-[3px] border px-3 text-sm ${
                filter === x.id ? "border-ink bg-ink text-paper" : "border-rule-strong bg-panel text-ink-2 hover:text-ink"
              }`}
            >
              {x.label}
              {count !== undefined && <span className="tabular ml-1.5 text-xs opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-5">
        {q.isError ? (
          <ErrorState title="Runs unavailable" message={(q.error as Error).message} />
        ) : !q.data ? (
          <Skeleton className="h-80" />
        ) : rows.length ? (
          <RunsTable runs={rows} />
        ) : (
          <EmptyState
            title={filter === "all" ? "No runs yet" : "No runs match this filter"}
            message={filter === "all" ? "Pick a model from the catalog and start a run." : "Choose another filter to see more runs."}
            action={filter === "all" ? <ButtonLink href="/models">Browse models</ButtonLink> : undefined}
          />
        )}
      </div>
    </div>
  );
}
