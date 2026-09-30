"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { int } from "@/lib/format";

// Sequential single-hue ramp (light -> dark) for nonzero density per cell.
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#1c5cab", "#104281", "#0d366b"];

interface Props {
  sparsity: { rows: number; cols: number; cells: number[] };
  modelRows: number;
  modelCols: number;
  className?: string;
  interactive?: boolean;
  label?: string;
  maxHeight?: number;
}

export function SparsityPlot({ sparsity, modelRows, modelCols, className, interactive = true, label, maxHeight = 520 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; r: number; c: number; v: number } | null>(null);

  // Display aspect follows the real matrix shape, clamped so thin matrices stay legible.
  const aspect = useMemo(() => {
    const a = modelRows / Math.max(modelCols, 1);
    return Math.min(Math.max(a, 0.3), 1.6);
  }, [modelRows, modelCols]);

  const maxLog = useMemo(() => {
    let m = 0;
    for (const v of sparsity.cells) if (v > m) m = v;
    return Math.log1p(m);
  }, [sparsity]);

  // The wrapper's width is measured; the plot shrinks below it when the height cap binds.
  const [box, setBox] = useState(0);
  const width = Math.min(box, maxHeight / aspect);
  const plotW = width;
  const height = Math.round(width * aspect);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !width) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const { rows, cols, cells } = sparsity;
    const cw = width / cols;
    const ch = height / rows;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const v = cells[i * cols + j];
        if (!v) continue;
        const t = maxLog ? Math.log1p(v) / maxLog : 1;
        ctx.fillStyle = RAMP[Math.min(RAMP.length - 1, Math.floor(t * (RAMP.length - 1) + 0.5))];
        ctx.fillRect(j * cw, i * ch, Math.max(cw, 0.8), Math.max(ch, 0.8));
      }
    }
  }, [sparsity, width, height, maxLog]);

  function onMove(e: React.PointerEvent) {
    if (!interactive) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.floor((x / rect.width) * sparsity.cols);
    const r = Math.floor((y / rect.height) * sparsity.rows);
    if (r < 0 || c < 0 || r >= sparsity.rows || c >= sparsity.cols) return setHover(null);
    setHover({ x, y, r, c, v: sparsity.cells[r * sparsity.cols + c] });
  }

  const rowSpan = (r: number) => [Math.floor((r * modelRows) / sparsity.rows), Math.floor(((r + 1) * modelRows) / sparsity.rows) - 1];
  const colSpan = (c: number) => [Math.floor((c * modelCols) / sparsity.cols), Math.floor(((c + 1) * modelCols) / sparsity.cols) - 1];

  return (
    <figure className={className}>
      <div ref={wrapRef} className="w-full">
      <div
        className="relative border border-rule bg-panel"
        style={{ width: plotW || "100%" }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height }}
          role="img"
          aria-label={
            label ??
            `Sparsity pattern of a ${int(modelRows)} by ${int(modelCols)} constraint matrix, binned into ${sparsity.rows} by ${sparsity.cols} cells.`
          }
        />
        {hover && (
          <div
            className="pointer-events-none absolute z-10 min-w-40 border border-rule-strong bg-panel px-2.5 py-2 text-xs shadow-sm"
            style={{
              left: Math.min(hover.x + 12, width - 170),
              top: hover.y + 14 > height - 60 ? hover.y - 64 : hover.y + 14,
            }}
          >
            <div className="tabular text-ink">
              <span className="font-medium">{int(hover.v)}</span> nonzeros
            </div>
            <div className="tabular mt-0.5 text-ink-3">
              rows {int(rowSpan(hover.r)[0])} to {int(rowSpan(hover.r)[1])}
            </div>
            <div className="tabular text-ink-3">
              columns {int(colSpan(hover.c)[0])} to {int(colSpan(hover.c)[1])}
            </div>
          </div>
        )}
      </div>
      </div>
      <figcaption className="mt-2 flex items-center justify-between gap-4 text-xs text-ink-3">
        <span className="tabular">
          {int(modelRows)} rows × {int(modelCols)} columns
        </span>
        <span className="flex items-center gap-2">
          <span>fewer</span>
          <span className="flex h-2 w-24" aria-hidden>
            {RAMP.map((c) => (
              <span key={c} className="h-full flex-1" style={{ background: c }} />
            ))}
          </span>
          <span>more nonzeros</span>
        </span>
      </figcaption>
    </figure>
  );
}
