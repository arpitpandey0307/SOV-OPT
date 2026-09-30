import Link from "next/link";
import { MarketingHeader, SiteFooter } from "@/components/site-chrome";
import { ButtonLink } from "@/components/ui";
import { ModelPreview } from "@/components/landing/model-preview";
import { CollectionCounts, HealthPreview } from "@/components/landing/live-bits";

const STAGES = [
  ["Profile", "Rows, columns, bounds, coefficient ranges and big-M links are measured before any solve."],
  ["Presolve", "Empty and singleton rows, fixed columns and loose bounds are reduced, and every reduction is logged."],
  ["Dispatch", "The engine picks dual simplex, interior point, PDLP on GPU or branch-and-cut, and records why."],
  ["Solve", "Objective, bound, gap, nodes and numerical recoveries stream to the browser as they happen."],
  ["Verify", "An independent checker recomputes feasibility, integrality and the duality gap in extended precision."],
  ["Record", "The run is sealed into a passport with hashes of the model, configuration and trace."],
];

const PASSPORT = [
  ["model.sha256", "Hash of the exact file that was solved"],
  ["configuration_sha256", "Hash of algorithm, limits, seed and switches"],
  ["hardware", "Processor, memory, GPU model and driver"],
  ["result", "Status, objective, bound, gap, iterations, nodes, time"],
  ["verification", "Each check, the value measured and its tolerance"],
  ["artifacts", "Hash of the full event trace for replay"],
];

export default function Home() {
  return (
    <>
      <MarketingHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
          <div className="max-w-3xl">
            <p className="eyebrow">Sovereign optimization engine</p>
            <h1 className="mt-4 text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-6xl">
              Solve refinery-scale models on an engine you can inspect.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
              SOV-OPT reads LP, MILP and QP models in standard MPS format, measures their numerical health, solves them on
              CPU and GPU, and checks every answer with an independent verifier.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/overview">Open the workspace</ButtonLink>
              <ButtonLink href="/models" variant="secondary">
                Profile a model
              </ButtonLink>
            </div>
          </div>

          <div className="mt-16 sm:mt-20">
            <ModelPreview collection="netlib" name="pilot" />
            <p className="mt-3 text-sm text-ink-3">
              PILOT, a 1,441 row economic planning model from the Netlib LP set, as read by the SOV-OPT profiler. Hover the
              matrix to inspect any block.
            </p>
          </div>
        </section>

        <section className="border-t border-rule">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[5fr_6fr] lg:items-center">
            <div>
              <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
                Read the model before you solve it.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-2">
                Weak big-M constants and coefficients spread across many orders of magnitude cause most solver failures in
                industrial planning models. SOV-OPT measures both the moment a file arrives and shows the statistic behind
                every warning.
              </p>
              <p className="mt-4 text-sm text-ink-3">
                Shown here: glass4 from MIPLIB 2017, a glass production scheduling model.
              </p>
            </div>
            <HealthPreview collection="miplib2017" name="glass4" />
          </div>
        </section>

        <section className="border-t border-rule bg-panel">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
              Follow every decision the solver makes.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
              Each run is an ordered stream of events. Close the tab mid-solve and the stream resumes from the last event
              you saw.
            </p>
            <ol className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {STAGES.map(([t, d], i) => (
                <li key={t} className="border-t border-rule-strong pt-4">
                  <div className="tabular font-mono text-xs text-ink-3">{String(i + 1).padStart(2, "0")}</div>
                  <div className="mt-2 font-medium text-ink">{t}</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-rule">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
                Every answer ships with evidence.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-2">
                A finished run produces an optimization passport and a downloadable bundle with the full trace. A reviewer
                can check which file was solved, on which hardware, with which settings, and what the verifier measured.
              </p>
            </div>
            <dl className="divide-y divide-rule border-y border-rule">
              {PASSPORT.map(([k, v]) => (
                <div key={k} className="grid gap-1 py-3.5 sm:grid-cols-[200px_1fr] sm:gap-6">
                  <dt className="font-mono text-[13px] text-ink">{k}</dt>
                  <dd className="text-sm text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-rule">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
              Built against the benchmark sets the problem statement names.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
              Netlib, MIPLIB 2017, the Maros-Meszaros convex QP set and QPLIB are loaded in the workspace with their
              published reference objectives.
            </p>
            <div className="mt-10">
              <CollectionCounts />
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <ButtonLink href="/benchmarks">Open the benchmark lab</ButtonLink>
              <Link href="/models" className="text-sm text-accent hover:text-accent-ink">
                Browse all models
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
