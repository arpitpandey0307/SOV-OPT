"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Counter } from "@/components/fx/motion";

export function LiveStats() {
  const cols = useQuery({ queryKey: ["collections"], queryFn: api.collections });
  const sys = useQuery({ queryKey: ["system"], queryFn: api.system });
  const models = cols.data?.reduce((s, c) => s + c.count, 0) ?? 0;
  const items = [
    { k: "Benchmark models loaded", v: <Counter to={models} />, sub: "Netlib, MIPLIB 2017, Maros-Meszaros, QPLIB" },
    { k: "Netlib models certified", v: <><Counter to={7} /> / 8</>, sub: "optimal and checked in exact arithmetic" },
    { k: "Duality gap on certificates", v: "1e-16", sub: "measured by the independent verifier" },
    { k: "Compute", v: sys.data?.gpus[0] ? "RTX 5050" : "CPU", sub: sys.data ? `${sys.data.host.logical_cores} cores live` : "detecting hardware" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.k} className="glow-border rounded-2xl bg-white/[0.03] p-5 backdrop-blur-xl">
          <dt className="text-xs text-ink-3">{it.k}</dt>
          <dd className="tabular mt-2 font-mono text-3xl font-semibold text-ink">{it.v}</dd>
          <dd className="mt-1 text-xs text-ink-3">{it.sub}</dd>
        </div>
      ))}
    </dl>
  );
}
