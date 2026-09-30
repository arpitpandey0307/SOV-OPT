"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

export const chartTheme = {
  ink: "#1b1a17",
  ink2: "#4a4843",
  ink3: "#7a776f",
  grid: "#e7e4dc",
  axis: "#c9c5ba",
  panel: "#fbfaf7",
  s1: "#1c5cab",
  s2: "#d95926",
  font: "var(--font-plex-sans), system-ui, sans-serif",
};

export function baseAxis(extra: Record<string, unknown> = {}) {
  return {
    axisLine: { lineStyle: { color: chartTheme.axis } },
    axisTick: { show: false },
    axisLabel: { color: chartTheme.ink3, fontSize: 11 },
    splitLine: { lineStyle: { color: chartTheme.grid } },
    nameTextStyle: { color: chartTheme.ink3, fontSize: 11 },
    ...extra,
  };
}

export function baseTooltip(extra: Record<string, unknown> = {}) {
  return {
    trigger: "axis",
    backgroundColor: chartTheme.panel,
    borderColor: chartTheme.axis,
    borderWidth: 1,
    padding: [6, 10],
    textStyle: { color: chartTheme.ink, fontSize: 12 },
    axisPointer: { type: "line", lineStyle: { color: chartTheme.ink3, width: 1 } },
    ...extra,
  };
}

export function EChart({ option, height = 260, label }: { option: EChartsCoreOption; height?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chart.current?.setOption({ animation: !reduce, animationDuration: 200, textStyle: { fontFamily: chartTheme.font }, ...option }, { notMerge: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={label} style={{ height, width: "100%" }} />;
}
