"use client";

import dynamic from "next/dynamic";

const HeroScene = dynamic(() => import("@/components/fx/hero-scene"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.25),transparent_60%)]" />,
});

export function Hero3D() {
  return (
    <div className="relative h-[420px] w-full sm:h-[520px]">
      <div aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(124,92,255,0.35),rgba(34,211,238,0.10)_40%,transparent_70%)] blur-2xl" />
      <HeroScene />
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-ink-3 backdrop-blur">
        Drag to rotate · simplex path to the optimum
      </div>
    </div>
  );
}
