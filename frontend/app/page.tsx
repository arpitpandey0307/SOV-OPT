import Link from "next/link";
import { MarketingHeader, SiteFooter } from "@/components/site-chrome";
import { ButtonLink } from "@/components/ui";
import { ModelPreview } from "@/components/landing/model-preview";
import { HealthPreview } from "@/components/landing/live-bits";
import { Hero3D } from "@/components/landing/hero-3d";
import { LiveStats } from "@/components/landing/live-stats";
import { Marquee, Reveal, RotatingWord, SpotlightCard, Tilt } from "@/components/fx/motion";

const STAGES = [
  ["Profile", "Rows, columns, bounds, coefficient ranges and big-M links are measured before any solve.", "#ff9a3c"],
  ["Scale", "Rows and columns are scaled to powers of two, so no rounding error is introduced.", "#ff4d8d"],
  ["Dispatch", "The engine picks primal simplex for LPs and records why it chose it.", "#c05cff"],
  ["Solve", "Objective, infeasibility and numerical recoveries stream to the browser live.", "#7c5cff"],
  ["Verify", "An independent checker recomputes feasibility and the duality gap in exact arithmetic.", "#3b82f6"],
  ["Seal", "The run is sealed into a passport with hashes of the model, configuration and trace.", "#22d3ee"],
];

const INSTANCES = [
  "afiro", "adlittle", "blend", "degen2", "degen3", "perold", "pilot", "greenbea", "glass4", "air05", "30n20b8",
  "neos859080", "markshare_4_0", "qafiro", "aug3dcqp", "cvxqp1_s", "qplib_0018", "refinery_planning", "irish-electricity",
];

const BENCH = [
  { model: "afiro", ours: true },
  { model: "adlittle", ours: true },
  { model: "blend", ours: true },
  { model: "degen2", ours: true },
  { model: "degen3", ours: true },
  { model: "perold", ours: true },
  { model: "pilot", ours: true },
  { model: "greenbea", ours: false },
];

export default function Home() {
  return (
    <>
      <MarketingHeader />
      <main className="overflow-hidden">
        {/* Hero */}
        <section className="relative">
          <div aria-hidden className="grid-bg absolute inset-0" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-4 pt-14 pb-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-ink-2 backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
                  SIH 2026 · PS 26119 · Sovereign optimization engine
                </span>
              </Reveal>
              <Reveal delay={0.08}>
                <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-tight sm:text-7xl">
                  Solve <RotatingWord words={["LP", "MILP", "QP"]} />
                  <br />
                  models on an engine
                  <br />
                  <span className="text-gradient">India can inspect.</span>
                </h1>
              </Reveal>
              <Reveal delay={0.16}>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
                  SOV-OPT reads industrial models in standard MPS format, measures their numerical health, solves them with a
                  from-scratch simplex core, and proves every answer with an independent exact-arithmetic verifier.
                </p>
              </Reveal>
              <Reveal delay={0.24}>
                <div className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink href="/overview" className="h-12 px-7 text-base">
                    Launch workspace
                  </ButtonLink>
                  <ButtonLink href="/models/industrial/refinery_planning" variant="secondary" className="h-12 px-7 text-base">
                    Try the refinery model
                  </ButtonLink>
                </div>
              </Reveal>
            </div>
            <Reveal delay={0.1}>
              <Hero3D />
            </Reveal>
          </div>
          <div className="relative mx-auto max-w-7xl px-4 pb-14 sm:px-6">
            <LiveStats />
          </div>
          <div className="pb-16">
            <Marquee items={INSTANCES} />
          </div>
        </section>

        {/* Model studio */}
        <section className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <Reveal>
            <p className="eyebrow">Model Studio</p>
            <h2 className="mt-3 max-w-3xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
              Read the model <span className="text-gradient">before</span> you solve it.
            </h2>
            <p className="mt-5 max-w-2xl text-lg text-ink-2">
              Big-M constants and coefficients spread across many orders of magnitude cause most solver failures in
              refinery planning. SOV-OPT measures both the moment a file arrives.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Reveal>
              <Tilt max={5}>
                <div className="glow-border rounded-2xl">
                  <ModelPreview collection="netlib" name="pilot" />
                </div>
              </Tilt>
            </Reveal>
            <Reveal delay={0.1}>
              <Tilt max={6}>
                <div className="glow-border rounded-2xl">
                  <HealthPreview collection="miplib2017" name="glass4" />
                </div>
              </Tilt>
            </Reveal>
          </div>
        </section>

        {/* Pipeline */}
        <section className="relative border-y border-white/10 bg-white/[0.015]">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <Reveal>
              <p className="eyebrow">Run pipeline</p>
              <h2 className="mt-3 max-w-3xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
                Follow every decision the solver makes.
              </h2>
            </Reveal>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {STAGES.map(([t, d, c], i) => (
                <Reveal key={t} delay={i * 0.07}>
                  <SpotlightCard className="h-full p-6">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-10 w-10 place-items-center rounded-xl font-mono text-sm font-semibold text-white"
                        style={{ background: `linear-gradient(135deg, ${c}, ${c}55)`, boxShadow: `0 0 24px -4px ${c}` }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-lg font-semibold">{t}</span>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-ink-2">{d}</p>
                  </SpotlightCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Evidence */}
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <Reveal>
            <p className="eyebrow">Optimization passport</p>
            <h2 className="mt-3 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
              Every answer ships with <span className="text-gradient">proof</span>.
            </h2>
            <p className="mt-5 text-lg text-ink-2">
              A finished run seals the model hash, configuration, hardware, result and the verifier&apos;s exact checks into
              a downloadable bundle that anyone can re-check.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <Tilt max={6}>
              <div className="glow-border overflow-hidden rounded-2xl bg-[#0b1024]/90 font-mono text-[13px] leading-6 shadow-[0_30px_80px_-20px_rgba(124,92,255,0.45)]">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs text-ink-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  <span className="ml-2">passport.json</span>
                </div>
                <pre className="overflow-x-auto p-5 text-ink-2">
{`{
  "model":        { "name": "refinery_planning", "sha256": "92ad5894…" },
  "solver":       { "version": "0.1.0", "engine": `}<span className="text-cyan">&quot;sovopt-native&quot;</span>{` },
  "result":       { "status": `}<span className="text-emerald">&quot;OPTIMAL&quot;</span>{`, "objective": 4729.5 },
  "verification": {
    "verdict":    `}<span className="text-saffron">&quot;OPTIMALITY_PROVED&quot;</span>{`,
    "precision":  "exact rational",
    "duality_gap": 1.34e-16
  }
}`}
                </pre>
              </div>
            </Tilt>
          </Reveal>
        </section>

        {/* Benchmarks */}
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <Reveal>
              <p className="eyebrow">Benchmarks</p>
              <h2 className="mt-3 max-w-3xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
                Measured against HiGHS on the same machine.
              </h2>
              <p className="mt-5 max-w-2xl text-lg text-ink-2">
                Seven of the eight Netlib models in the workspace are solved to the published optimum and certified. GREENBEA
                is the open case, and the fix (a sparse LU) is next on the roadmap.
              </p>
            </Reveal>
            <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {BENCH.map((b, i) => (
                <Reveal key={b.model} delay={i * 0.05}>
                  <div
                    className={`rounded-2xl border p-4 text-center backdrop-blur ${
                      b.ours ? "border-emerald/30 bg-emerald/[0.07]" : "border-warn/30 bg-warn/[0.06]"
                    }`}
                  >
                    <div className="font-mono text-sm text-ink">{b.model}</div>
                    <div className={`mt-2 text-xs font-semibold ${b.ours ? "text-emerald" : "text-warn"}`}>
                      {b.ours ? "certified" : "in progress"}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.2}>
              <div className="relative mt-16 overflow-hidden rounded-3xl border border-white/10 p-10 text-center sm:p-14">
                <div aria-hidden className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,154,60,0.25),rgba(255,77,141,0.2),rgba(124,92,255,0.25),rgba(34,211,238,0.2))]" />
                <div className="relative">
                  <h3 className="text-3xl font-semibold tracking-tight sm:text-4xl">Put a real model through it.</h3>
                  <p className="mx-auto mt-3 max-w-xl text-ink-2">
                    Upload an MPS file or open the refinery planning model, solve it, and download the evidence bundle.
                  </p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <ButtonLink href="/models?upload=1" className="h-12 px-7 text-base">
                      Upload a model
                    </ButtonLink>
                    <ButtonLink href="/benchmarks" variant="secondary" className="h-12 px-7 text-base">
                      Open the benchmark lab
                    </ButtonLink>
                  </div>
                  <p className="mt-6 text-xs text-ink-3">
                    Full report: <Link href="https://github.com/arpitpandey0307/SOV-OPT/blob/main/bench/reports/netlib.md" className="underline hover:text-ink">bench/reports/netlib.md</Link>
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
