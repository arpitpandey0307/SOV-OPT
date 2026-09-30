"use client";

import { useState } from "react";
import { int } from "@/lib/format";

export function CoefHistogram({ data, title }: { data: { exp: number; count: number }[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="text-sm text-ink-3">No nonzero coefficients.</p>;

  const lo = Math.min(...data.map((d) => d.exp));
  const hi = Math.max(...data.map((d) => d.exp));
  const buckets = Array.from({ length: hi - lo + 1 }, (_, i) => ({
    exp: lo + i,
    count: data.find((d) => d.exp === lo + i)?.count ?? 0,
  }));
  const max = Math.max(...buckets.map((b) => b.count));
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const H = 140;

  return (
    <figure>
      <figcaption className="mb-3 text-sm font-medium text-ink">{title}</figcaption>
      <div className="relative" onPointerLeave={() => setHover(null)}>
        <div className="flex h-[140px] items-end gap-[2px] border-b border-rule-strong" role="img" aria-label={`${title}. ${buckets.length} magnitude buckets from 1e${lo} to 1e${hi}.`}>
          {buckets.map((b, i) => (
            <div
              key={b.exp}
              className="relative flex h-full flex-1 items-end"
              onPointerEnter={() => setHover(i)}
            >
              <div
                className="w-full rounded-t-[3px]"
                style={{
                  height: b.count ? Math.max(2, (Math.log1p(b.count) / Math.log1p(max)) * H) : 0,
                  background: hover === null || hover === i ? "var(--series-1)" : "#9ec5f4",
                }}
              />
            </div>
          ))}
        </div>
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-y-full border border-rule-strong bg-panel px-2.5 py-1.5 text-xs whitespace-nowrap"
            style={{ left: `${((hover + 0.5) / buckets.length) * 100}%`, transform: "translate(-50%, -100%)" }}
          >
            <div className="tabular text-ink">
              |a| in [1e{buckets[hover].exp}, 1e{buckets[hover].exp + 1})
            </div>
            <div className="tabular text-ink-3">
              {int(buckets[hover].count)} coefficients · {((buckets[hover].count / total) * 100).toFixed(1)}%
            </div>
          </div>
        )}
        <div className="mt-1.5 flex justify-between text-[11px] text-ink-3 tabular">
          <span>1e{lo}</span>
          {hi - lo > 2 && <span>1e{Math.round((lo + hi) / 2)}</span>}
          <span>1e{hi}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-3">Bar height is log scaled so rare extreme magnitudes stay visible.</p>
    </figure>
  );
}
