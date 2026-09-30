"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { int } from "@/lib/format";
import { Badge, Skeleton, healthWord } from "@/components/ui";

export function HealthPreview({ collection, name }: { collection: string; name: string }) {
  const q = useQuery({ queryKey: ["analysis", collection, name], queryFn: () => api.analysis(collection, name) });
  const a = q.data?.analysis;
  if (q.isError) return null;
  if (!a) return <Skeleton className="h-72" />;
  const order = { risk: 0, warn: 1, info: 2, ok: 3 } as const;
  const items = [...a.health].sort((x, y) => order[x.status] - order[y.status]).slice(0, 4);
  return (
    <div className="border border-rule bg-panel">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3 text-sm">
        <span>
          <span className="text-ink-3">Health report</span>
          <span className="mx-2 text-rule-strong">/</span>
          <span className="font-medium">{name}</span>
        </span>
        <Link href={`/models/${collection}/${name}?tab=health`} className="text-accent hover:text-accent-ink">
          Full report
        </Link>
      </div>
      <ul className="divide-y divide-rule">
        {items.map((h) => (
          <li key={h.key} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-5 py-3.5">
            <span className="text-sm font-medium text-ink">{h.label}</span>
            <span className="tabular text-right font-mono text-sm">{h.value}</span>
            <span className="text-xs text-ink-3">{h.statistic}</span>
            <span className="text-right">
              <Badge tone={h.status} glyph>
                {healthWord[h.status]}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CollectionCounts() {
  const q = useQuery({ queryKey: ["collections"], queryFn: api.collections });
  if (q.isError) return null;
  const cols = q.data?.filter((c) => c.id !== "uploads");
  return (
    <dl className="grid grid-cols-2 gap-px border border-rule bg-rule md:grid-cols-4">
      {(cols ?? [0, 1, 2, 3]).map((c, i) =>
        typeof c === "number" ? (
          <div key={i} className="bg-paper p-6">
            <Skeleton className="h-16" />
          </div>
        ) : (
          <div key={c.id} className="bg-paper p-6">
            <dt className="text-sm text-ink-2">{c.title}</dt>
            <dd className="tabular mt-2 font-mono text-3xl text-ink">{int(c.count)}</dd>
            <dd className="mt-1 text-xs text-ink-3">{c.kind} instances</dd>
          </div>
        ),
      )}
    </dl>
  );
}
