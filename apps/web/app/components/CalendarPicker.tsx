"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  value: string; // "YYYY-MM-DDTHH:MM"
  onChange: (val: string) => void;
  minDatetime?: string; // "YYYY-MM-DDTHH:MM"
  disabled?: boolean;

  // "HH:MM" list to disable for the selected date
  disabledTimes?: string[];

  // time UI
  timePicker?: "select" | "slider_numeric";
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseValue(val: string) {
  if (!val) return { date: "", time: "" };
  const [date, time] = val.split("T");
  return { date, time: time?.slice(0, 5) ?? "" };
}

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}
function minutesToTime(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
function roundToStep(min: number, step = 15) {
  return Math.round(min / step) * step;
}

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

// client-only display
function formatDisplay(val: string): string {
  const d = new Date(val);
  const yyyy = d.getFullYear();
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}年${mm}月${dd}日（${wd}） ${hh}:${min}`;
}

export default function CalendarPicker({
  label,
  value,
  onChange,
  minDatetime,
  disabled,
  disabledTimes,
  timePicker = "slider_numeric",
}: Props) {
  const { date: selectedDate, time: selectedTime } = parseValue(value);

  // client-only "today"
  const [todayStr, setTodayStr] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const now = new Date();
    setTodayStr(formatDate(now.getFullYear(), now.getMonth(), now.getDate()));
    setMounted(true);
  }, []);

  // calendar view
  const [viewYear, setViewYear] = useState<number>(() => {
    if (selectedDate) return parseInt(selectedDate.slice(0, 4));
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    if (selectedDate) return parseInt(selectedDate.slice(5, 7)) - 1;
    return new Date().getMonth();
  });

  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timePanelRef = useRef<HTMLDivElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Portal position state (fixed coords)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; openUp: boolean } | null>(null);

  const minDate = minDatetime?.split("T")[0] ?? "";
  const minTime = minDatetime?.split("T")[1]?.slice(0, 5) ?? "";

  function isDateDisabled(dateStr: string) {
    if (!minDate) return false;
    return dateStr < minDate;
  }

  function isTimeDisabledByMin(dateStr: string, timeStr: string) {
    if (!minDate || !minTime) return false;
    if (dateStr > minDate) return false;
    if (dateStr === minDate) return timeStr <= minTime;
    return false;
  }

  function isTimeDisabled(dateStr: string, timeStr: string) {
    if (disabledTimes && disabledTimes.includes(timeStr)) return true;
    return isTimeDisabledByMin(dateStr, timeStr);
  }

  const allowedTimes = useMemo(() => {
    if (!selectedDate) return [];
    return TIME_OPTIONS.filter((t) => !isTimeDisabled(selectedDate, t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, minDate, minTime, (disabledTimes ?? []).join(",")]);

  const allowedMinutes = useMemo(() => allowedTimes.map(timeToMinutes), [allowedTimes]);

  function snapToAllowedMinutes(targetMin: number) {
    if (allowedMinutes.length == 0) return targetMin;
    if (allowedMinutes.includes(targetMin)) return targetMin;

    let best = allowedMinutes[0];
    let bestDist = Math.abs(best - targetMin);

    for (const m of allowedMinutes) {
      const dist = Math.abs(m - targetMin);
      if (dist < bestDist) {
        best = m;
        bestDist = dist;
      } else if (dist === bestDist && m > best) {
        best = m; // tie => forward
      }
    }
    return best;
  }

  function setTimeMinutes(min: number) {
    if (!selectedDate) return;
    const snapped = snapToAllowedMinutes(roundToStep(min, 15));
    onChange(`${selectedDate}T${minutesToTime(snapped)}`);
  }

  function handleDateClick(dateStr: string) {
    if (isDateDisabled(dateStr)) return;

    const preferred = selectedTime || "09:00";
    let next = preferred;

    if (isTimeDisabled(dateStr, preferred)) {
      const first = TIME_OPTIONS.find((t) => !isTimeDisabled(dateStr, t));
      next = first ?? "09:00";
    }

    onChange(`${dateStr}T${next}`);

    setTimeout(() => {
      timePanelRef.current?.scrollIntoView({ block: "nearest" });
      timeInputRef.current?.focus();
    }, 0);
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  }

  // calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // slider state value (minutes)
  const sliderMin = useMemo(() => {
    if (!selectedTime) return 0;
    return timeToMinutes(selectedTime);
  }, [selectedTime]);

  // compute blocked ranges (for overlay bar)
  const blockedRanges = useMemo(() => {
    if (!selectedDate) return [];
    const blocked = TIME_OPTIONS.filter((t) => isTimeDisabled(selectedDate, t)).map(timeToMinutes);
    if (blocked.length === 0) return [];
    blocked.sort((a, b) => a - b);

    const ranges: Array<{ start: number; end: number }> = [];
    let s = blocked[0];
    let prev = blocked[0];

    for (let i = 1; i < blocked.length; i++) {
      const cur = blocked[i];
      if (cur === prev + 15) {
        prev = cur;
        continue;
      }
      ranges.push({ start: s, end: prev + 15 });
      s = cur;
      prev = cur;
    }
    ranges.push({ start: s, end: prev + 15 });
    return ranges;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, minDate, minTime, (disabledTimes ?? []).join(",")]);

  // --- Portal positioning ---
  function computePos() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();

    const margin = 6;
    const dropdownMaxH = Math.min(window.innerHeight * 0.70, 520);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < dropdownMaxH + 20; // heuristic

    const width = Math.min(Math.max(r.width, 320), 460);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    if (left < 8) left = 8;

    const top = openUp ? (r.top - margin) : (r.bottom + margin);
    setPos({ left, top, width, openUp });
  }

  useEffect(() => {
    if (!open) return;
    computePos();
    const onResize = () => computePos();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true); // capture scroll in containers too
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // close on outside click (portal overlay handles it; still keep ESC)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const dropdown = open && mounted && pos
    ? createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2000 }}
          onMouseDown={() => setOpen(false)}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: pos.left,
              // openUp: anchor at bottom by translating using maxHeight
              top: pos.openUp ? undefined : pos.top,
              bottom: pos.openUp ? (window.innerHeight - pos.top) : undefined,
              width: pos.width,
              background: "#161616",
              border: "1px solid #2a2a2a",
              borderRadius: 10,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              maxHeight: "min(70vh, 520px)",
              overflowY: "auto",
            }}
          >
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={prevMonth}
                  style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 4, color: "#bbb", fontSize: 14, padding: "4px 10px", cursor: "pointer" }}
                >
                  ◀
                </button>
                <span style={{ fontWeight: 700, fontSize: 14, color: "hsl(var(--foreground))" }}>
                  {viewYear}年 {viewMonth + 1}月
                </span>
                <button
                  type="button"
                  onClick={nextMonth}
                  style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 4, color: "#bbb", fontSize: 14, padding: "4px 10px", cursor: "pointer" }}
                >
                  ▶
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
                {WEEKDAYS.map((w, i) => (
                  <div
                    key={w}
                    style={{
                      textAlign: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      color: i === 0 ? "#f87171" : i === 6 ? "#93c5fd" : "#999",
                      padding: "4px 0",
                    }}
                  >
                    {w}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {cells.map((day, idx) => {
                  if (!day) return <div key={idx} />;
                  const dateStr = formatDate(viewYear, viewMonth, day);
                  const dis = isDateDisabled(dateStr);
                  const sel = selectedDate === dateStr;
                  const isToday = mounted && todayStr !== "" && dateStr === todayStr;
                  const col = idx % 7;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleDateClick(dateStr)}
                      disabled={dis}
                      suppressHydrationWarning
                      style={{
                        padding: "7px 2px",
                        borderRadius: 5,
                        fontSize: 13,
                        fontWeight: sel ? 800 : 400,
                        border: isToday && !sel ? "1px solid #555" : "none",
                        background: sel ? "#e63946" : "transparent",
                        color: dis ? "#333" : sel ? "#fff" : col === 0 ? "#f87171" : col === 6 ? "#93c5fd" : "#ccc",
                        cursor: dis ? "not-allowed" : "pointer",
                        transition: "background 0.1s",
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              <div style={{ height: 12 }} />
            </div>

            {/* sticky time panel */}
            <div
              ref={timePanelRef}
              style={{
                position: "sticky",
                bottom: 0,
                background: "#161616",
                borderTop: "1px solid #222",
                padding: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  時刻
                </div>
                <div style={{ fontSize: 12, color: "#999" }}>15分刻み／満席は自動スナップ</div>
              </div>

              {!selectedDate && <div style={{ marginTop: 8, fontSize: 13, color: "#aaa" }}>先に日付を選択してください</div>}
              {selectedDate && allowedTimes.length === 0 && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#ef4444" }}>この日は選択可能な時刻がありません</div>
              )}

              {selectedDate && allowedTimes.length > 0 && timePicker === "slider_numeric" && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{selectedTime || allowedTimes[0]}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#aaa" }}>直接入力</span>
                      <input
                        ref={timeInputRef}
                        type="time"
                        step={900}
                        value={selectedTime || allowedTimes[0]}
                        onChange={(e) => {
                          const t = e.target.value.slice(0, 5);
                          setTimeMinutes(timeToMinutes(t));
                        }}
                        style={{
                          background: "#1a1a1a",
                          border: "1px solid #2a2a2a",
                          borderRadius: 6,
                          color: "#fff",
                          padding: "6px 10px",
                          fontSize: 14,
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setTimeMinutes(sliderMin - 15)}
                      style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#fff", cursor: "pointer" }}
                    >
                      -15
                    </button>

                    <div style={{ flex: 1 }}>
                      <input
                        type="range"
                        min={0}
                        max={24 * 60 - 15}
                        step={15}
                        value={sliderMin}
                        onChange={(e) => setTimeMinutes(Number(e.target.value))}
                        style={{ width: "100%" }}
                      />

                      <div style={{ position: "relative", height: 6, marginTop: 6, borderRadius: 999, background: "#222" }}>
                        {blockedRanges.map((r, i) => {
                          const left = (r.start / 1440) * 100;
                          const width = ((r.end - r.start) / 1440) * 100;
                          return (
                            <div
                              key={i}
                              style={{
                                position: "absolute",
                                left: `${left}%`,
                                width: `${width}%`,
                                top: 0,
                                bottom: 0,
                                borderRadius: 999,
                                background: "rgba(239, 68, 68, 0.55)",
                              }}
                            />
                          );
                        })}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "#999" }}>
                        <span>00:00</span>
                        <span>12:00</span>
                        <span>23:45</span>
                      </div>

                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#bbb" }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "rgba(239, 68, 68, 0.55)" }} />
                        <span>満席</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setTimeMinutes(sliderMin + 15)}
                      style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#fff", cursor: "pointer" }}
                    >
                      +15
                    </button>
                  </div>
                </div>
              )}

              {selectedDate && allowedTimes.length > 0 && timePicker === "select" && (
                <div style={{ marginTop: 10 }}>
                  <select
                    value={selectedTime}
                    onChange={(e) => {
                      const t = e.target.value;
                      if (selectedDate) onChange(`${selectedDate}T${t}`);
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "#1a1a1a",
                      border: "1px solid #2a2a2a",
                      borderRadius: 6,
                      color: "#fff",
                      fontSize: 14,
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t} disabled={selectedDate ? isTimeDisabled(selectedDate, t) : false} style={{ color: selectedDate && isTimeDisabled(selectedDate, t) ? "#555" : "#fff" }}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  marginTop: 12,
                  width: "100%",
                  padding: "9px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 800,
                  border: "none",
                  background: "linear-gradient(135deg, #e63946, #c1121f)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                決定
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <label
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "hsl(var(--muted-foreground))",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          display: "block",
          marginBottom: 6,
        }}
      >
        {label}
      </label>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (disabled) return;
          triggerRef.current?.scrollIntoView({ block: "center" });
          setOpen((o) => !o);
        }}
        suppressHydrationWarning
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "#1a1a1a",
          border: `1px solid ${open ? "#e63946" : "#2a2a2a"}`,
          borderRadius: 6,
          color: mounted && value ? "#fff" : "#444",
          fontSize: 14,
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: "border-color 0.15s",
        }}
      >
        <span suppressHydrationWarning>
          {mounted ? (value ? formatDisplay(value) : "日時を選択してください") : value ? "…" : "日時を選択してください"}
        </span>
        <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 16 }}>📅</span>
      </button>

      {dropdown}
    </div>
  );
}
