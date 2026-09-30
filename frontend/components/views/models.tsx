"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ModelSummary } from "@/lib/api";
import { bytes, compact, int, reference } from "@/lib/format";
import { PageHeader } from "@/components/platform/shell";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";

const PAGE = 50;

function useParamState() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return { sp, set };
}

function AnalysisCell({ m }: { m: ModelSummary }) {
  if (m.analysis_state === "ready") return <span className="text-ink-2">Profiled</span>;
  if (m.analysis_state === "running") return <span className="text-accent">Reading</span>;
  if (m.analysis_state === "failed") return <span className="text-risk">Unreadable</span>;
  if (m.analysis_state === "unavailable") return <span className="text-ink-3">Metadata</span>;
  return <span className="text-ink-3">Queued</span>;
}

export function ModelsView() {
  const { sp, set } = useParamState();
  const collection = sp.get("collection") ?? "";
  const kind = sp.get("kind") ?? "";
  const sort = sp.get("sort") ?? "name";
  const page = Number(sp.get("page") ?? "0");
  const [q, setQ] = useState(sp.get("q") ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set({ q, page: null });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const cols = useQuery({ queryKey: ["collections"], queryFn: api.collections, refetchInterval: 8000 });
  const list = useQuery({
    queryKey: ["models", collection, kind, sort, sp.get("q") ?? "", page],
    queryFn: () =>
      api.models({ collection, kind, sort, q: sp.get("q") ?? "", offset: page * PAGE, limit: PAGE }),
    placeholderData: keepPreviousData,
    refetchInterval: 8000,
  });

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Catalog"
        title="Models"
        description="Every model the solver can read. Open one to see its structure, numerical health and run history."
        actions={<UploadDialog defaultOpen={sp.get("upload") === "1"} onClosed={() => set({ upload: null })} />}
      />

      <div className="mt-6 flex flex-wrap gap-x-1 gap-y-2 border-b border-rule" role="tablist" aria-label="Collections">
        {[{ id: "", title: "All", count: cols.data?.reduce((s, c) => s + c.count, 0) }, ...(cols.data ?? [])].map((c) => {
          const active = collection === c.id;
          return (
            <button
              key={c.id || "all"}
              role="tab"
              aria-selected={active}
              onClick={() => set({ collection: c.id || null, page: null })}
              className={`-mb-px border-b-2 px-3 pb-2.5 text-sm ${
                active ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {c.title}
              {c.count !== undefined && <span className="tabular ml-1.5 text-xs text-ink-3">{int(c.count)}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="model-search" className="text-xs text-ink-3">
            Search by name
          </label>
          <input
            id="model-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. glass4, pilot, qafiro"
            className="mt-1 h-9 w-full rounded-[3px] border border-rule-strong bg-panel px-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="model-kind" className="text-xs text-ink-3">
            Problem type
          </label>
          <select
            id="model-kind"
            value={kind}
            onChange={(e) => set({ kind: e.target.value || null, page: null })}
            className="mt-1 block h-9 rounded-[3px] border border-rule-strong bg-panel px-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">Any</option>
            <option value="LP">LP</option>
            <option value="MILP">MILP</option>
            <option value="QP">QP</option>
            <option value="MIQP">MIQP</option>
          </select>
        </div>
        <div>
          <label htmlFor="model-sort" className="text-xs text-ink-3">
            Sort
          </label>
          <select
            id="model-sort"
            value={sort}
            onChange={(e) => set({ sort: e.target.value === "name" ? null : e.target.value, page: null })}
            className="mt-1 block h-9 rounded-[3px] border border-rule-strong bg-panel px-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="name">Name</option>
            <option value="nnz">Nonzeros</option>
            <option value="rows">Constraints</option>
            <option value="size">File size</option>
          </select>
        </div>
      </div>

      <div className="mt-5">
        {list.isError ? (
          <ErrorState title="Catalog unavailable" message={(list.error as Error).message} />
        ) : !list.data ? (
          <Skeleton className="h-96" />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            title="No models match"
            message="Try a different name or clear the problem type filter."
            action={
              <Button variant="secondary" onClick={() => { setQ(""); set({ q: null, kind: null, page: null }); }}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto border border-rule bg-panel">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-ink-3">
                  <th className="px-4 py-2.5 font-medium">Model</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 text-right font-medium">Constraints</th>
                  <th className="px-4 py-2.5 text-right font-medium">Variables</th>
                  <th className="px-4 py-2.5 text-right font-medium">Nonzeros</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reference objective</th>
                  <th className="px-4 py-2.5 text-right font-medium">File</th>
                  <th className="px-4 py-2.5 font-medium">Profile</th>
                </tr>
              </thead>
              <tbody className={list.isPlaceholderData ? "opacity-60" : ""}>
                {list.data.items.map((m) => (
                  <tr key={`${m.collection}/${m.name}`} className="border-b border-rule last:border-0 hover:bg-sunken/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/models/${m.collection}/${m.name}`} className="font-medium text-ink hover:text-accent">
                        {m.name}
                      </Link>
                      {!collection && <div className="text-xs text-ink-3">{m.collection}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge>{m.kind}</Badge>
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{compact(m.rows)}</td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{compact(m.cols)}</td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{compact(m.nnz)}</td>
                    <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">
                      <span className={m.reference_status === "opt" ? "" : "text-ink-3"}>
                        {reference(m.reference_status, m.reference_objective)}
                      </span>
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-ink-3">{bytes(m.size_bytes)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <AnalysisCell m={m} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {list.data && total > PAGE && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          <span className="tabular text-ink-3">
            {int(page * PAGE + 1)} to {int(Math.min(total, (page + 1) * PAGE))} of {int(total)}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" className="h-8" disabled={page === 0} onClick={() => set({ page: page - 1 ? String(page - 1) : null })}>
              Previous
            </Button>
            <Button variant="secondary" className="h-8" disabled={page + 1 >= pages} onClick={() => set({ page: String(page + 1) })}>
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

function UploadDialog({ defaultOpen, onClosed }: { defaultOpen: boolean; onClosed: () => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: (f: File) => api.upload(f),
    onSuccess: (inst) => {
      qc.invalidateQueries({ queryKey: ["models"] });
      qc.invalidateQueries({ queryKey: ["collections"] });
      router.push(`/models/${inst.collection}/${inst.name}`);
    },
  });

  const valid = file && /\.(mps|mps\.gz|qps)$/i.test(file.name);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setFile(null);
          m.reset();
          onClosed();
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button>Upload a model</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border border-rule-strong bg-paper p-6 focus:outline-none">
          <Dialog.Title className="text-lg font-semibold">Upload a model</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-2">
            MPS or QPS files up to 200 MB, plain or gzip compressed. The file is profiled as soon as it arrives.
          </Dialog.Description>
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (file && valid) m.mutate(file);
            }}
          >
            <label
              htmlFor="model-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center border border-dashed px-4 py-10 text-center ${
                drag ? "border-accent bg-accent-wash/40" : "border-rule-strong bg-panel"
              }`}
            >
              <span className="text-sm text-ink">{file ? file.name : "Choose a file or drop it here"}</span>
              <span className="mt-1 text-xs text-ink-3">{file ? bytes(file.size) : ".mps, .mps.gz or .qps"}</span>
              <input
                ref={inputRef}
                id="model-file"
                type="file"
                accept=".mps,.gz,.qps"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && !valid && <p className="mt-2 text-sm text-risk">This file type is not supported. Use .mps, .mps.gz or .qps.</p>}
            {m.isError && (
              <p role="alert" className="mt-2 text-sm text-risk">
                {(m.error as Error).message}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!valid || m.isPending}>
                {m.isPending ? "Uploading" : "Upload and profile"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
