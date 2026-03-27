"use client";

import { useEffect, useRef, useMemo, useState } from "react";

export type HistoryPoint = { time: string; bps: number; lostPct: number };

const CAM_COLORS = ["#4ade80","#60a5fa","#fbbf24","#f87171","#c084fc"];

// CDN から ApexCharts を一度だけ読み込む
let apexLoaded = false;
let apexPromise: Promise<void> | null = null;

function loadApex(): Promise<void> {
  if (apexLoaded) return Promise.resolve();
  if (apexPromise) return apexPromise;
  apexPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/apexcharts@3/dist/apexcharts.min.js";
    s.onload  = () => { apexLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return apexPromise;
}

function useApexChart(getOptions: () => object, deps: React.DependencyList) {
  const ref   = useRef<HTMLDivElement>(null);
  const chart = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadApex().then(() => {
      if (cancelled || !ref.current) return;
      const ApexCharts = (window as any).ApexCharts;
      chart.current = new ApexCharts(ref.current, getOptions());
      chart.current.render();
      setReady(true);
    });
    return () => {
      cancelled = true;
      chart.current?.destroy();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !chart.current) return;
    chart.current.updateOptions(getOptions(), false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...deps]);

  return ref;
}

// ─── ビットレート エリアチャート ──────────────────────
export function BitrateChart({ history }: { history: Map<string, HistoryPoint[]> }) {
  const { series, categories } = useMemo(() => {
    const entries = Array.from(history.entries()).sort(([a],[b]) =>
      parseInt(a.replace(/^cam(\d+)-.*/, "$1")) - parseInt(b.replace(/^cam(\d+)-.*/, "$1")));
    return {
      categories: (entries[0]?.[1] ?? []).map(p => p.time),
      series: entries.map(([path, pts], i) => ({
        name: `Camera ${parseInt(path.replace(/^cam(\d+)-.*/, "$1") ?? String(i+1))}`,
        data: pts.map(p => Math.round(p.bps / 1000)),
      })),
    };
  }, [history]);

  const getOptions = () => ({
    chart: {
      type: "area",
      background: "transparent",
      toolbar: { show: true, tools: { zoom: true, reset: true, pan: true, download: false, selection: false, zoomin: true, zoomout: true } },
      animations: { enabled: true, easing: "easeinout", speed: 400 },
    },
    theme: { mode: "dark" },
    colors: CAM_COLORS,
    series,
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2.5 },
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 90, 100] },
    },
    markers: { size: 0, hover: { size: 5 } },
    xaxis: {
      categories,
      labels: { style: { colors: "rgba(255,255,255,0.45)", fontSize: "11px" }, hideOverlappingLabels: true },
      axisBorder: { color: "rgba(255,255,255,0.08)" },
      axisTicks:  { color: "rgba(255,255,255,0.08)" },
      tickAmount: 8,
    },
    yaxis: {
      min: 0,
      labels: {
        style: { colors: "rgba(255,255,255,0.45)", fontSize: "11px" },
        formatter: (v: number) => `${v.toLocaleString()} k`,
      },
    },
    grid: { borderColor: "rgba(255,255,255,0.06)", strokeDashArray: 4, xaxis: { lines: { show: false } } },
    tooltip: {
      theme: "dark", shared: true, intersect: false,
      y: { formatter: (v: number) => `${v.toLocaleString()} kbps` },
    },
    legend: { labels: { colors: "rgba(255,255,255,0.75)" }, itemMargin: { horizontal: 12 } },
    noData: { text: "配信開始後に表示されます", style: { color: "rgba(255,255,255,0.35)", fontSize: "13px" } },
  });

  const ref = useApexChart(getOptions, [series, categories]);
  return <div ref={ref} style={{ minHeight: 240 }} />;
}

// ─── パケットロス ラインチャート ──────────────────────
export function PacketLossChart({ history }: { history: Map<string, HistoryPoint[]> }) {
  const { series, categories } = useMemo(() => {
    const entries = Array.from(history.entries()).sort(([a],[b]) =>
      parseInt(a.replace(/^cam(\d+)-.*/, "$1")) - parseInt(b.replace(/^cam(\d+)-.*/, "$1")));
    return {
      categories: (entries[0]?.[1] ?? []).map(p => p.time),
      series: entries.map(([path, pts], i) => ({
        name: `Camera ${parseInt(path.replace(/^cam(\d+)-.*/, "$1") ?? String(i+1))}`,
        data: pts.map(p => parseFloat(p.lostPct.toFixed(3))),
      })),
    };
  }, [history]);

  const getOptions = () => ({
    chart: {
      type: "line",
      background: "transparent",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, easing: "linear", speed: 400 },
    },
    theme: { mode: "dark" },
    colors: CAM_COLORS,
    series,
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2 },
    markers: { size: 3, strokeWidth: 0, hover: { size: 6 } },
    xaxis: {
      categories,
      labels: { style: { colors: "rgba(255,255,255,0.45)", fontSize: "11px" }, hideOverlappingLabels: true },
      axisBorder: { color: "rgba(255,255,255,0.08)" },
      axisTicks:  { color: "rgba(255,255,255,0.08)" },
      tickAmount: 8,
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: {
        style: { colors: "rgba(255,255,255,0.45)", fontSize: "11px" },
        formatter: (v: number) => `${v.toFixed(2)}%`,
      },
    },
    grid: { borderColor: "rgba(255,255,255,0.06)", strokeDashArray: 4 },
    annotations: {
      yaxis: [{
        y: 1,
        borderColor: "rgba(251,191,36,0.6)",
        strokeDashArray: 5,
        label: {
          text: "警告 1%",
          style: { color: "#fbbf24", background: "transparent", fontSize: "11px" },
          position: "right",
          offsetX: -10,
        },
      }],
    },
    tooltip: {
      theme: "dark", shared: true, intersect: false,
      y: { formatter: (v: number) => `${v.toFixed(3)}%` },
    },
    legend: { labels: { colors: "rgba(255,255,255,0.75)" }, itemMargin: { horizontal: 12 } },
    noData: { text: "配信開始後に表示されます", style: { color: "rgba(255,255,255,0.35)", fontSize: "13px" } },
  });

  const ref = useApexChart(getOptions, [series, categories]);
  return <div ref={ref} style={{ minHeight: 200 }} />;
}

// ─── 現在のビットレート 棒グラフ ──────────────────────
export function BitrateSummaryChart({
  cameras, bpsMap,
}: {
  cameras: { path: string; cameraIndex: number; ready: boolean }[];
  bpsMap: Map<string, number>;
}) {
  const sorted = useMemo(() =>
    [...cameras].sort((a,b) => a.cameraIndex - b.cameraIndex), [cameras]);

  const series = useMemo(() => [{
    name: "Bitrate",
    data: sorted.map(c => Math.round((bpsMap.get(c.path) ?? 0) / 1000)),
  }], [sorted, bpsMap]);

  const getOptions = () => ({
    chart: {
      type: "bar",
      background: "transparent",
      toolbar: { show: false },
      animations: { enabled: true, easing: "easeinout", speed: 500 },
    },
    theme: { mode: "dark" },
    colors: sorted.map(c =>
      c.ready ? CAM_COLORS[(c.cameraIndex-1) % CAM_COLORS.length] : "rgba(255,255,255,0.15)"),
    series,
    plotOptions: {
      bar: { borderRadius: 6, distributed: true, dataLabels: { position: "top" } },
    },
    dataLabels: {
      enabled: true,
      formatter: (v: number) => v > 0 ? `${v}k` : "OFF",
      offsetY: -18,
      style: { fontSize: "11px", colors: ["rgba(255,255,255,0.65)"] },
    },
    xaxis: {
      categories: sorted.map(c => `Cam ${c.cameraIndex}`),
      labels: { style: { colors: "rgba(255,255,255,0.55)", fontSize: "12px" } },
      axisBorder: { show: false },
      axisTicks:  { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: "rgba(255,255,255,0.45)" },
        formatter: (v: number) => `${v}k`,
      },
    },
    grid: { borderColor: "rgba(255,255,255,0.06)", strokeDashArray: 4 },
    legend: { show: false },
    tooltip: { theme: "dark", y: { formatter: (v: number) => `${v.toLocaleString()} kbps` } },
  });

  const ref = useApexChart(getOptions, [series, sorted]);
  return <div ref={ref} style={{ minHeight: 180 }} />;
}
