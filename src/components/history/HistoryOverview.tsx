"use client";

import { useEffect, useState } from "react";
import type { Overview, RangeSummary } from "@/lib/history/query";
import { fmtMinutes, fmtNum } from "@/lib/time";
import { RangeView } from "./RangeView";

type Row = { k: string; get: (s: RangeSummary) => string | null };

const ROWS: Row[] = [
  { k: "Listening", get: (s) => (s.music.plays ? fmtMinutes(s.music.minutes) : null) },
  { k: "Plays", get: (s) => (s.music.plays ? fmtNum(s.music.plays) : null) },
  { k: "Songs", get: (s) => (s.music.songs ? fmtNum(s.music.songs) : null) },
  { k: "New songs", get: (s) => (s.music.newSongs ? fmtNum(s.music.newSongs) : null) },
  { k: "Artists", get: (s) => (s.music.artists ? fmtNum(s.music.artists) : null) },
  { k: "New artists", get: (s) => (s.music.newArtists ? fmtNum(s.music.newArtists) : null) },
  { k: "Days with music", get: (s) => (s.music.byDay.length ? fmtNum(s.music.byDay.length) : null) },
  { k: "Top song", get: (s) => s.music.topTracks[0]?.track ?? null },
  { k: "Top artist", get: (s) => s.music.topArtists[0]?.name ?? null },
  { k: "Pins saved", get: (s) => (s.pins.count ? fmtNum(s.pins.count) : null) },
  { k: "Pushes", get: (s) => (s.code.pushes ? fmtNum(s.code.pushes) : null) },
  { k: "Distance moved", get: (s) => (s.activity.km ? `${s.activity.km} km` : null) },
  { k: "Steps a day", get: (s) => (s.health.avgSteps ? fmtNum(s.health.avgSteps) : null) },
  { k: "In bed by, usually", get: (s) => (s.bed?.typical && s.bed.nights > 1 ? s.bed.typical : null) },
];

/**
 * The top of /history: every period side by side in one table, then the top
 * tens for whichever period you pick.
 */
export function HistoryOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [pick, setPick] = useState(2); // this month

  useEffect(() => {
    fetch("/api/history/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return <div className="min-h-[60vh]" aria-hidden />;
  const rows = ROWS.filter((r) => data.periods.some((p) => r.get(p.summary)));
  const chosen = data.periods[pick];

  return (
    <div>
      <section>
        <h2 className="mb-4 border-t border-ink pt-1.5 font-semibold">At a glance</h2>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tnum w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr>
                <th className="w-[22%] py-2 font-normal text-quiet" />
                {data.periods.map((p, i) => (
                  <th key={p.key} scope="col" className="py-2 font-semibold">
                    <button type="button" onClick={() => setPick(i)} className={`text-left hover:underline ${i === pick ? "underline underline-offset-4" : ""}`}>
                      {p.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k} className="border-t border-ink/15">
                  <th scope="row" className="py-2 pr-4 font-normal text-quiet">
                    {r.k}
                  </th>
                  {data.periods.map((p) => {
                    const v = r.get(p.summary);
                    return (
                      <td key={p.key} className={`max-w-[12rem] truncate py-2 pr-4 ${v ? "" : "text-quiet/50"}`}>
                        {v ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-24">
        <div className="mb-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-t border-ink pt-1.5">
          <h2 className="font-semibold">The top tens</h2>
          <div className="flex flex-wrap gap-x-5 gap-y-1" role="group" aria-label="Period">
            {data.periods.map((p, i) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPick(i)}
                aria-pressed={i === pick}
                className={i === pick ? "font-semibold underline underline-offset-4" : "text-quiet hover:text-ink"}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-10 text-[clamp(2rem,6vw,4.5rem)] leading-none font-extrabold tracking-[-0.04em]">{chosen.label}</p>
        <RangeView s={chosen.summary} />
      </section>
    </div>
  );
}
