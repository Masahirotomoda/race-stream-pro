"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (val: string) => void;
  minDatetime?: string;
  disabled?: boolean;
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

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_OPTIONS.push(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    );
  }
}

// ロケール依存の日時フォーマット（クライアント専用）
function formatDisplay(val: string): string {
  const d = new Date(val);
  const yyyy = d.getFullYear();
  const mm   = d.getMonth() + 1;
  const dd   = d.getDate();
  const wd   = ["日","月","火","水","木","金","土"][d.getDay()];
  const hh   = String(d.getHours()).padStart(2, "0");
  const min  = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}年${mm}月${dd}日（${wd}） ${hh}:${min}`;
}

export default function CalendarPicker({
  label, value, onChange, minDatetime, disabled,
}: Props) {
  const { date: selectedDate, time: selectedTime } = parseValue(value);

  // ── クライアント専用の "今日" ──────────────────────────────
  const [todayStr, setTodayStr] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const now = new Date();
    setTodayStr(formatDate(now.getFullYear(), now.getMonth(), now.getDate()));
    setMounted(true);
  }, []);

  // ── カレンダー表示月 ───────────────────────────────────────
  const [viewYear, setViewYear] = useState<number>(() => {
    if (selectedDate) return parseInt(selectedDate.slice(0, 4));
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    if (selectedDate) return parseInt(selectedDate.slice(5, 7)) - 1;
    return new Date().getMonth();
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const minDate = minDatetime?.split("T")[0] ?? "";
  const minTime = minDatetime?.split("T")[1]?.slice(0, 5) ?? "";

  function isDateDisabled(dateStr: string) {
    if (!minDate) return false;
    return dateStr < minDate;
  }

  function isTimeDisabled(timeStr: string) {
    if (!selectedDate || !minDate || !minTime) return false;
    if (selectedDate > minDate) return false;
    if (selectedDate === minDate) return timeStr <= minTime;
    return false;
  }

  function handleDateClick(dateStr: string) {
    if (isDateDisabled(dateStr)) return;
    onChange(`${dateStr}T${selectedTime || "09:00"}`);
  }

  function handleTimeChange(time: string) {
    if (!selectedDate) return;
    onChange(`${selectedDate}T${time}`);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  // カレンダーグリッド生成
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <label style={{
        fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))",
        letterSpacing: "0.1em", textTransform: "uppercase",
        display: "block", marginBottom: 6,
      }}>
        {label}
      </label>

      {/* ── トリガーボタン ── */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        suppressHydrationWarning   /* toLocaleString の差異を抑制 */
        style={{
          width: "100%", padding: "10px 14px",
          background: "#1a1a1a",
          border: `1px solid ${open ? "#e63946" : "#2a2a2a"}`,
          borderRadius: 6,
          color: (mounted && value) ? "#fff" : "#444",
          fontSize: 14, textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "border-color 0.15s",
        }}
      >
        {/* mounted 後のみ日時文字列を表示（SSR との差異を回避） */}
        <span suppressHydrationWarning>
          {mounted
            ? (value ? formatDisplay(value) : "日時を選択してください")
            : (value ? "…" : "日時を選択してください")}
        </span>
        <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 16 }}>📅</span>
      </button>

      {/* ── ドロップダウンカレンダー ── */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0,
          zIndex: 100, background: "#161616",
          border: "1px solid #2a2a2a", borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          padding: 16, minWidth: 300,
        }}>
          {/* 月ナビゲーション */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <button type="button" onClick={prevMonth}
              style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 4, color: "#bbb", fontSize: 14, padding: "4px 10px", cursor: "pointer" }}>
              ◀
            </button>
            <span style={{ fontWeight: 700, fontSize: 14, color: "hsl(var(--foreground))" }}>
              {viewYear}年 {viewMonth + 1}月
            </span>
            <button type="button" onClick={nextMonth}
              style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 4, color: "#bbb", fontSize: 14, padding: "4px 10px", cursor: "pointer" }}>
              ▶
            </button>
          </div>

          {/* 曜日ヘッダー */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {WEEKDAYS.map((w, i) => (
              <div key={w} style={{
                textAlign: "center", fontSize: 13, fontWeight: 700,
                color: i === 0 ? "#f87171" : i === 6 ? "#93c5fd" : "#999",
                padding: "4px 0",
              }}>
                {w}
              </div>
            ))}
          </div>

          {/* 日付グリッド */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={idx} />;
              const dateStr = formatDate(viewYear, viewMonth, day);
              const isDisabled = isDateDisabled(dateStr);
              const isSelected = selectedDate === dateStr;
              // todayStr はクライアント専用なので SSR では "" → isToday = false
              const isToday = mounted && todayStr !== "" && dateStr === todayStr;
              const col = idx % 7;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleDateClick(dateStr)}
                  disabled={isDisabled}
                  suppressHydrationWarning   /* isToday による style 差異を抑制 */
                  style={{
                    padding: "7px 2px", borderRadius: 5, fontSize: 13,
                    fontWeight: isSelected ? 800 : 400,
                    border: isToday && !isSelected ? "1px solid #555" : "none",
                    background: isSelected ? "#e63946" : "transparent",
                    color: isDisabled
                      ? "#333"
                      : isSelected
                      ? "#fff"
                      : col === 0 ? "#f87171"
                      : col === 6 ? "#93c5fd"
                      : "#ccc",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    transition: "background 0.1s",
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* 時刻セレクタ */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #222" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--muted-foreground))", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              時刻
            </div>
            <select
              value={selectedTime}
              onChange={e => handleTimeChange(e.target.value)}
              disabled={!selectedDate}
              style={{
                width: "100%", padding: "8px 12px",
                background: "#1a1a1a", border: "1px solid #2a2a2a",
                borderRadius: 5,
                color: selectedDate ? "#fff" : "#444",
                fontSize: 14, outline: "none",
                cursor: selectedDate ? "pointer" : "not-allowed",
                opacity: selectedDate ? 1 : 0.5,
              }}
            >
              {TIME_OPTIONS.map(t => (
                <option
                  key={t} value={t}
                  disabled={isTimeDisabled(t)}
                  style={{ color: isTimeDisabled(t) ? "#555" : "#fff" }}
                >
                  {t}
                </option>
              ))}
            </select>
            {!selectedDate && (
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#aaa" }}>
                先に日付を選択してください
              </p>
            )}
          </div>

          {/* 決定ボタン */}
          {selectedDate && selectedTime && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                marginTop: 12, width: "100%", padding: "8px",
                borderRadius: 5, fontSize: 13, fontWeight: 700,
                border: "none",
                background: "linear-gradient(135deg, #e63946, #c1121f)",
                color: "hsl(var(--foreground))", cursor: "pointer",
              }}
            >
              決定
            </button>
          )}
        </div>
      )}
    </div>
  );
}
