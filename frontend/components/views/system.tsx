"use client";

import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Gpu } from "@/lib/api";
import { bytes, int } from "@/lib/format";
import { PageHeader } from "@/components/platform/shell";
import { EChart, baseAxis, baseTooltip, chartTheme } from "@/components/charts/echart";
import { EmptyState, ErrorState, Panel, Skeleton, Stat } from "@/components/ui";

const WINDOW = 120;

interface Sample {
  t: number;
  util: number | null;
  mem: number | null;
  power: number | null;
  temp: number | null;
  clock: number | null;
}

function Spark({ data, unit, max, title }: { data: [number, number | null][]; unit: string; max?: number; title: string }) {
  const opt = useMemo(
    () => ({
      grid: { left: 4, right: 12, top: 12, bottom: 4, containLabel: true },
      tooltip: baseTooltip({ valueFormatter: (v: number) => `${v.toFixed(unit === "%" ? 0 : 1)} ${unit}` }),
      xAxis: baseAxis({ type: "time", splitLine: { show: false }, axisLabel: { show: false } }),
      yAxis: baseAxis({ type: "value", min: 0, max, splitNumber: 3, axisLabel: { color: chartTheme.ink3, fontSize: 10 } }),
      series: [{ name: title, type: "line", showSymbol: false, data, lineStyle: { width: 2, color: chartTheme.s1 }, itemStyle: { color: chartTheme.s1 }, areaStyle: { color: "rgba(28,92,171,0.07)" } }],
    }),
    [data, unit, max, title],
  );
  return <EChart option={opt} height={130} label={`${title} over the last two minutes`} />;
}

export function SystemView() {
  const sys = useQuery({ queryKey: ["system"], queryFn: api.system, refetchInterval: 10000 });
  const buffer = useRef<Sample[]>([]);
  const gpu = useQuery({
    queryKey: ["gpu"],
    queryFn: async () => {
      const d = await api.gpu();
      const g: Gpu | undefined = d.gpus[0];
      if (g) {
        buffer.current = [
          ...buffer.current,
          { t: d.t * 1000, util: g.utilization_gpu, mem: g.memory_used_mb, power: g.power_w, temp: g.temperature_c, clock: g.clock_sm_mhz },
        ].slice(-WINDOW);
      }
      return { ...d, samples: buffer.current };
    },
    refetchInterval: 1000,
    gcTime: 0,
  });

  const g = gpu.data?.gpus[0];
  const samples = gpu.data?.samples ?? [];
  const series = (k: keyof Sample) => samples.map((s) => [s.t, s[k]] as [number, number | null]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Compute"
        title="GPU observatory"
        description="Live device telemetry from the machine running the solver, sampled once per second from the NVIDIA driver."
      />

      {gpu.isError ? (
        <div className="mt-8">
          <ErrorState title="Telemetry unavailable" message={(gpu.error as Error).message} />
        </div>
      ) : gpu.data && !g ? (
        <div className="mt-8">
          <EmptyState title="No CUDA device detected" message="The solver runs on CPU only on this machine. Install an NVIDIA driver to enable GPU kernels." />
        </div>
      ) : !g ? (
        <Skeleton className="mt-8 h-64" />
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{g.name}</h2>
            <span className="tabular text-sm text-ink-3">
              driver {g.driver} · PCIe gen {g.pcie_gen ?? "n/a"} x{g.pcie_width ?? "n/a"}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-6 border-b border-rule pb-6 md:grid-cols-5">
            <Stat label="Utilization" value={`${g.utilization_gpu ?? 0}%`} />
            <Stat label="Memory in use" value={`${int(g.memory_used_mb)} MB`} sub={`of ${int(g.memory_total_mb)} MB`} />
            <Stat label="Power" value={g.power_w !== null ? `${g.power_w.toFixed(1)} W` : "n/a"} sub={g.power_limit_w ? `limit ${g.power_limit_w} W` : undefined} />
            <Stat label="Temperature" value={g.temperature_c !== null ? `${g.temperature_c} °C` : "n/a"} />
            <Stat label="SM clock" value={`${int(g.clock_sm_mhz)} MHz`} sub={`max ${int(g.clock_sm_max_mhz)} MHz`} />
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {samples.length < 2 ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)
            ) : (
              <>
                <figure>
                  <figcaption className="text-sm font-medium">Utilization</figcaption>
                  <Spark data={series("util")} unit="%" max={100} title="GPU utilization" />
                </figure>
                <figure>
                  <figcaption className="text-sm font-medium">Memory in use</figcaption>
                  <Spark data={series("mem")} unit="MB" max={g.memory_total_mb ?? undefined} title="GPU memory in use" />
                </figure>
                <figure>
                  <figcaption className="text-sm font-medium">Power draw</figcaption>
                  <Spark data={series("power")} unit="W" title="GPU power draw" />
                </figure>
                <figure>
                  <figcaption className="text-sm font-medium">Temperature</figcaption>
                  <Spark data={series("temp")} unit="°C" title="GPU temperature" />
                </figure>
              </>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-3">Rolling window of the last {WINDOW} samples. The history resets when you leave this page.</p>
        </>
      )}

      <section className="mt-12">
        <h2 className="text-base font-semibold">Host</h2>
        <Panel className="mt-4 p-5">
          {sys.data ? (
            <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Processor" value={<span className="font-sans text-base">{sys.data.host.cpu}</span>} />
              <Stat label="Logical cores" value={int(sys.data.host.logical_cores)} />
              <Stat label="Memory" value={bytes(sys.data.host.memory_bytes)} />
              <Stat label="Operating system" value={<span className="font-sans text-base">{sys.data.host.os}</span>} />
            </dl>
          ) : (
            <Skeleton className="h-14" />
          )}
        </Panel>
      </section>
    </div>
  );
}
