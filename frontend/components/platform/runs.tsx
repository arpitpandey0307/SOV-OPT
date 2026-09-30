"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Kind, type Run, type RunConfig } from "@/lib/api";
import { ago, label, num, pct, seconds } from "@/lib/format";
import { Badge, Button } from "@/components/ui";

export function RunStatusBadge({ run }: { run: Pick<Run, "status" | "result_status"> }) {
  if (run.status === "queued") return <Badge tone="accent">Queued</Badge>;
  if (run.status === "running") return <Badge tone="accent">Running</Badge>;
  if (run.status === "cancelled") return <Badge tone="neutral">Cancelled</Badge>;
  if (run.status === "failed") return <Badge tone="risk" glyph>{run.result_status === "INTERRUPTED" ? "Interrupted" : "Failed"}</Badge>;
  const r = run.result_status ?? "";
  if (r === "OPTIMAL") return <Badge tone="ok" glyph>Optimal</Badge>;
  if (r === "INFEASIBLE") return <Badge tone="info" glyph>Infeasible</Badge>;
  if (r === "UNBOUNDED") return <Badge tone="info" glyph>Unbounded</Badge>;
  if (r === "NUMERICAL_ERROR") return <Badge tone="risk" glyph>Numerical error</Badge>;
  if (r.startsWith("TIME_LIMIT")) return <Badge tone="warn" glyph>Time limit</Badge>;
  return <Badge tone="neutral">{label(r)}</Badge>;
}

export function VerdictBadge({ verdict }: { verdict?: string | null }) {
  if (!verdict) return <span className="text-ink-3">n/a</span>;
  if (verdict === "OPTIMALITY_PROVED") return <Badge tone="ok" glyph>Optimality proved</Badge>;
  if (verdict === "FEASIBLE_VERIFIED") return <Badge tone="ok" glyph>Feasible, verified</Badge>;
  if (verdict === "NO_SOLUTION") return <Badge tone="neutral">No solution</Badge>;
  if (verdict === "INFEASIBILITY_REPORTED") return <Badge tone="info" glyph>Infeasibility reported</Badge>;
  return <Badge tone="risk" glyph>{label(verdict)}</Badge>;
}

export function RunsTable({ runs, showModel = true }: { runs: Run[]; showModel?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-rule bg-panel">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-xs text-ink-3">
            <th className="px-4 py-2.5 font-medium">Run</th>
            {showModel && <th className="px-4 py-2.5 font-medium">Model</th>}
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 text-right font-medium">Objective</th>
            <th className="px-4 py-2.5 text-right font-medium">Gap</th>
            <th className="px-4 py-2.5 text-right font-medium">Time</th>
            <th className="px-4 py-2.5 font-medium">Verification</th>
            <th className="px-4 py-2.5 text-right font-medium">Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-rule whitespace-nowrap last:border-0 transition-colors hover:bg-white/[0.04]">
              <td className="px-4 py-2.5">
                <Link href={`/runs/${r.id}`} className="font-mono text-[13px] text-accent hover:text-accent-ink">
                  {r.id.replace("run_", "")}
                </Link>
              </td>
              {showModel && (
                <td className="px-4 py-2.5">
                  <Link href={`/models/${r.collection}/${r.instance}`} className="text-ink hover:text-accent">
                    {r.instance}
                  </Link>
                  <span className="ml-2 text-xs text-ink-3">{r.kind}</span>
                </td>
              )}
              <td className="px-4 py-2.5">
                <RunStatusBadge run={r} />
              </td>
              <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{num(r.objective, 8)}</td>
              <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{r.gap === null ? "n/a" : pct(r.gap, 3)}</td>
              <td className="tabular px-4 py-2.5 text-right font-mono text-[13px]">{seconds(r.elapsed)}</td>
              <td className="px-4 py-2.5">
                <VerdictBadge verdict={r.verification?.verdict} />
              </td>
              <td className="px-4 py-2.5 text-right text-ink-3">{ago(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ALGORITHMS: { value: RunConfig["algorithm"]; label: string; hint: string }[] = [
  { value: "auto", label: "Automatic", hint: "The dispatcher picks from model structure." },
  { value: "dual_simplex", label: "Dual simplex", hint: "Basic solution, best for warm starts." },
  { value: "primal_simplex", label: "Primal simplex", hint: "Useful after column changes." },
  { value: "ipm", label: "Interior point", hint: "Large sparse LPs and convex QPs." },
  { value: "pdlp", label: "PDLP on GPU", hint: "First-order method for very large LPs." },
];

function Field({ label: l, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {l}
      </label>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-rule-strong bg-panel px-2.5 text-sm text-ink tabular focus:border-accent focus:outline-none";

export function NewRunDialog({
  collection,
  name,
  kind,
  children,
}: {
  collection: string;
  name: string;
  kind: Kind;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<RunConfig>({
    algorithm: "auto",
    time_limit: 60,
    mip_gap: 0.0001,
    gpu: true,
    threads: 8,
    seed: 42,
    presolve: true,
    deterministic: true,
  });
  const isMip = kind === "MILP" || kind === "MIQP";

  const m = useMutation({
    mutationFn: () => api.createRun(collection, name, cfg),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["model", collection, name] });
      setOpen(false);
      router.push(`/runs/${run.id}`);
    },
  });

  const set = <K extends keyof RunConfig>(k: K, v: RunConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const timeValid = cfg.time_limit > 0 && cfg.time_limit <= 3600;
  const gapValid = cfg.mip_gap >= 0 && cfg.mip_gap <= 1;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/15 bg-[#0a0f22]/95 p-6 shadow-[0_40px_120px_-20px_rgba(124,92,255,0.5)] focus:outline-none">
          <Dialog.Title className="text-lg font-semibold">Solve {name}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-2">
            The run is queued on the solver worker. You can follow it live and cancel it at any time.
          </Dialog.Description>

          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (timeValid && gapValid) m.mutate();
            }}
          >
            <fieldset>
              <legend className="text-sm font-medium text-ink">Algorithm</legend>
              <div className="mt-2 grid gap-1.5">
                {ALGORITHMS.map((a) => (
                  <label
                    key={a.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                      cfg.algorithm === a.value ? "border-accent bg-accent-wash/50" : "border-rule hover:border-rule-strong"
                    }`}
                  >
                    <input
                      type="radio"
                      name="algorithm"
                      value={a.value}
                      checked={cfg.algorithm === a.value}
                      onChange={() => set("algorithm", a.value)}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    <span>
                      <span className="block text-sm text-ink">{a.label}</span>
                      <span className="block text-xs text-ink-3">{a.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Time budget (s)" hint="The solver returns its best verified answer by then." htmlFor={`${id}-t`}>
                <input
                  id={`${id}-t`}
                  type="number"
                  min={1}
                  max={3600}
                  step={1}
                  value={cfg.time_limit}
                  onChange={(e) => set("time_limit", Number(e.target.value))}
                  aria-invalid={!timeValid}
                  className={inputCls}
                />
                {!timeValid && <p className="mt-1 text-xs text-risk">Enter 1 to 3600 seconds.</p>}
              </Field>
              {isMip ? (
                <Field label="Relative MIP gap" hint="Stop when the proven gap is this small." htmlFor={`${id}-g`}>
                  <input
                    id={`${id}-g`}
                    type="number"
                    min={0}
                    max={1}
                    step="any"
                    value={cfg.mip_gap}
                    onChange={(e) => set("mip_gap", Number(e.target.value))}
                    aria-invalid={!gapValid}
                    className={inputCls}
                  />
                  {!gapValid && <p className="mt-1 text-xs text-risk">Enter a value between 0 and 1.</p>}
                </Field>
              ) : (
                <Field label="Threads" hint="CPU threads for pricing and factorization." htmlFor={`${id}-th`}>
                  <input
                    id={`${id}-th`}
                    type="number"
                    min={1}
                    max={256}
                    value={cfg.threads}
                    onChange={(e) => set("threads", Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
              )}
              <Field label="Random seed" htmlFor={`${id}-s`}>
                <input
                  id={`${id}-s`}
                  type="number"
                  min={0}
                  value={cfg.seed}
                  onChange={(e) => set("seed", Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="space-y-2">
              {(
                [
                  ["gpu", "Use GPU acceleration", "Heuristics and first-order kernels run on the GPU when they help."],
                  ["presolve", "Presolve", "Remove redundant rows and columns and tighten bounds first."],
                  ["deterministic", "Deterministic mode", "Same seed and configuration give the same search."],
                ] as const
              ).map(([k, l, h]) => (
                <label key={k} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={cfg[k]}
                    onChange={(e) => set(k, e.target.checked)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-sm text-ink">{l}</span>
                    <span className="block text-xs text-ink-3">{h}</span>
                  </span>
                </label>
              ))}
            </div>

            {m.isError && <p role="alert" className="text-sm text-risk">{(m.error as Error).message}</p>}

            <div className="flex justify-end gap-2 border-t border-rule pt-5">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={m.isPending || !timeValid || !gapValid}>
                {m.isPending ? "Starting" : "Start run"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
