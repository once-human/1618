"use client";

import { useEffect, useState } from "react";
import { fetchHistory } from "@/lib/presence/client";
import type { RangeSummary } from "@/lib/history/query";
import { RangeView } from "./RangeView";

type Mode = "week" | "month" | "year" | "all" | "custom";

const OFFSET = 5.5 * 3600_000;
const today = () => new Date(Date.now() + OFFSET).toISOString().slice(0, 10);

function shiftMonth(m: string, by: number) {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

const tab = (on: boolean) => `border-t pt-1.5 text-left ${on ? "border-ink font-semibold" : "border-ink/20 text-quiet hover:text-ink"}`;

/** Look back over any stretch: the last week, a month, a year, everything, or two dates you pick. */
export function HistorySearch() {
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [year, setYear] = useState(today().slice(0, 4));
  const [from, setFrom] = useState(() => new Date(Date.now() + OFFSET - 30 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today());
  const [data, setData] = useState<(RangeSummary & { label: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  const query =
    mode === "month"
      ? `range=month&at=${month}`
      : mode === "year"
        ? `range=year&at=${year}`
        : mode === "custom"
          ? `from=${from}&to=${to}`
          : `range=${mode}`;

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchHistory(query).then((d) => {
      if (!live) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [query]);

  const nowMonth = today().slice(0, 7);
  const nowYear = today().slice(0, 4);

  return (
    <div>
      <div className="mb-6 grid grid-cols-5 gap-3 text-[15px]">
        {(["week", "month", "year", "all", "custom"] as Mode[]).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={tab(mode === m)} aria-pressed={mode === m}>
            {m === "week" ? "7 days" : m === "custom" ? "dates" : m}
          </button>
        ))}
      </div>

      <div className="mb-12 flex flex-wrap items-baseline gap-x-6 gap-y-3">
        <p className="text-[clamp(2rem,6vw,4.5rem)] leading-none font-extrabold tracking-[-0.04em]">{data?.label ?? " "}</p>
        {mode === "month" && (
          <span className="flex gap-4 text-quiet">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="hover:text-ink">
              ← earlier
            </button>
            {month < nowMonth && (
              <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="hover:text-ink">
                later →
              </button>
            )}
          </span>
        )}
        {mode === "year" && (
          <span className="flex gap-4 text-quiet">
            <button type="button" onClick={() => setYear(String(Number(year) - 1))} className="hover:text-ink">
              ← {Number(year) - 1}
            </button>
            {year < nowYear && (
              <button type="button" onClick={() => setYear(String(Number(year) + 1))} className="hover:text-ink">
                {Number(year) + 1} →
              </button>
            )}
          </span>
        )}
        {mode === "custom" && (
          <span className="flex flex-wrap items-baseline gap-3">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="border-b border-ink bg-transparent" aria-label="From" />
            <span className="text-quiet">to</span>
            <input type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} className="border-b border-ink bg-transparent" aria-label="To" />
          </span>
        )}
      </div>

      <div className={loading ? "opacity-40 transition-opacity" : "transition-opacity"} aria-busy={loading}>
        {data ? <RangeView s={data} /> : loading ? <div className="min-h-[40vh]" /> : <p className="text-quiet">Couldn&apos;t reach the history store. Try again in a bit.</p>}
      </div>
    </div>
  );
}
