"use client";

import { useEffect, useRef } from "react";

// ─── 型定義 ─────────────────────────────────────────────
export type HistoryPoint = { time: number; value: number };

// ─── ApexCharts CDN 読み込み ─────────────────────────────
let apexLoaded = false;
let apexLoading = false;
const apexCallbacks: Array<() => void> = [];

function loadApex(): Promise<void> {
  return new Promise((resolve) => {
    if (apexLoaded) { resolve(); return; }
    apexCallbacks.push(resolve);
    if (apexLoading) return;
    apexLoading = true;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/apexcharts@3/dist/apexcharts.min.js";
    script.onload = () => {
      apexLoaded = true;
      apexLoading = false;
      apexCallbacks.forEach((cb) => cb());
      apexCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

// ─── useApexChart フック ─────────────────────────────────
function useApexChart(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: object,
  deps: unknown[]
) {
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    loadApex().then(() => {
      if (destroyed || !containerRef.current) return;
      const ApexCharts = (window as any).ApexCharts;
      if (!ApexCharts) return;

      if (chartRef.current) {
        chartRef.current.updateOptions(options, false, false);
      } else {
        chartRef.current = new ApexCharts(containerRef.current, options);
        chartRef.current.render();
      }
    });

    return () => {
      destroyed = true;
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ─── カラーパレット ──────────────────────────────────────
const CAMERA_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#a78bfa", "#34d399", "#fb7185"];

// ─── BitrateChart ────────────────────────────────────────
export function BitrateChart({
  history,
  label = "ビットレート (kbps)",
  color = "#6366f1",
  height = 200,
}: {
  history: HistoryPoint[];
  label?: string;
  color?: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const series = [{
    name: label,
    data: history.map((p) => ({ x: p.time, y: p.value })),
  }];

  const options = {
    series,
    chart: {
      type: "area",
      height,
      background: "transparent",
      toolbar: { show: false },
      animations: { enabled: true, easing: "linear", dynamicAnimation: { speed: 500 } },
      zoom: { enabled: false },
    },
    theme: { mode: "dark" },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 100],
      },
    },
    colors: [color],
    xaxis: {
      type: "datetime",
      labels: {
        style: { colors: "rgba(255,255,255,0.45)", fontSize: "11px" },
        datetimeFormatter: { minute: "HH:mm", second: "HH:mm:ss" },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 0,
      labels: {
        style: { colors: "rgba(255,255,255,0.45)", fontSize: "11px" },
        formatter: (v: number) => `${v.toLocaleString()} kbps`,
      },
    },
    grid: {
      borderColor: "rgba(255,255,255,0.06)",
      strokeDashArray: 4,
    },
    tooltip: {
      theme: "dark",
      x: { format: "HH:mm:ss" },
      y: { formatter: (v: number) => `${v.toLocaleString()} kbps` },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  useApexChart(ref, options, [JSON.stringify(series), height]);

  return <div ref={ref} style={{ width: "100%", minHeight: height }} />;
}

// ─── PacketLossChart ─────────────────────────────────────
export function PacketLossChart({
  history,
  label = "パケットロス (%)",
  height = 140,
}: {
  history: HistoryPoint[];
  label?: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const series = [{
    name: label,
    data: history.map((p) => ({ x: p.time, y: p.value })),
  }];

  const options = {
    series,
    chart: {
      type: "area",
      height,
      background: "transparent",
      toolbar: { show: false },
      animations: { enabled: true, easing: "linear", dynamicAnimation: { speed: 500 } },
      zoom: { enabled: false },
    },
    theme: { mode: "dark" },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.40,
        opacityTo: 0.02,
        stops: [0, 100],
      },
    },
    colors: ["#f87171"],
    xaxis: {
      type: "datetime",
      labels: {
        style: { colors: "rgba(255,255,255,0.45)", fontSize: "11px" },
        datetimeFormatter: { minute: "HH:mm", second: "HH:mm:ss" },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 0,
      max: (max: number) => Math.max(max * 1.2, 2),
      labels: {
        style: { colors: "rgba(255,255,255,0.45)", fontSize: "11px" },
        formatter: (v: number) => `${v.toFixed(2)}%`,
      },
    },
    grid: {
      borderColor: "rgba(255,255,255,0.06)",
      strokeDashArray: 4,
    },
    tooltip: {
      theme: "dark",
      x: { format: "HH:mm:ss" },
      y: { formatter: (v: number) => `${v.toFixed(3)}%` },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  useApexChart(ref, options, [JSON.stringify(series), height]);

  return <div ref={ref} style={{ width: "100%", minHeight: height }} />;
}

// ─── BitrateSummaryChart（複数カメラ合算） ───────────────
export function BitrateSummaryChart({
  histories,
  height = 220,
}: {
  histories: Record<string, HistoryPoint[]>;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const entries = Object.entries(histories);
  const series = entries.map(([path, pts], idx) => ({
    name: `Camera ${idx + 1}`,
    data: pts.map((p) => ({ x: p.time, y: p.value })),
  }));

  const options = {
    series,
    chart: {
      type: "line",
      height,
      background: "transparent",
      toolbar: { show: false },
      animations: { enabled: true, easing: "linear", dynamicAnimation: { speed: 500 } },
      zoom: { enabled: false },
    },
    theme: { mode: "dark" },
    stroke: { curve: "smooth", width: 2 },
    colors: CAMERA_COLORS,
    xaxis: {
      type: "datetime",
      labels: {
        style: { colors: "rgba(255,255,255,0.45)", fontSize: "11px" },
        datetimeFormatter: { minute: "HH:mm", second: "HH:mm:ss" },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 0,
      labels: {
        style: { colors: "rgba(255,255,255,0.45)", fontSize: "11px" },
        formatter: (v: number) => `${v.toLocaleString()} kbps`,
      },
    },
    grid: {
      borderColor: "rgba(255,255,255,0.06)",
      strokeDashArray: 4,
    },
    tooltip: {
      theme: "dark",
      x: { format: "HH:mm:ss" },
      y: { formatter: (v: number) => `${v.toLocaleString()} kbps` },
    },
    dataLabels: { enabled: false },
    legend: {
      show: true,
      labels: { colors: "rgba(255,255,255,0.75)" },
    },
  };

  useApexChart(ref, options, [JSON.stringify(series), height]);

  return <div ref={ref} style={{ width: "100%", minHeight: height }} />;
}
