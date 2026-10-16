"use client";

import { useListening, useNow } from "@/lib/presence/client";
import { fmtNum } from "@/lib/time";
import { Label } from "@/components/site/Label";
import { Preview } from "@/components/live/Preview";

/** Pune's hour right now, for highlighting the clock. */
const puneHour = (now: number) => new Date(now + 5.5 * 3600_000).getUTCHours();

/**
 * On repeat this month, and when I listen: a 24-hour strip of my plays over
 * the last 30 days. Numbers underneath: days in a row, plays in total.
 */
export function ListeningStats() {
  const s = useListening();
  const now = useNow();
  if (!s) return null;

  const max = Math.max(1, ...(s.clock ?? [0]));
  const peak = s.clock ? s.clock.indexOf(Math.max(...s.clock)) : null;
  const hourNow = now ? puneHour(now) : null;

  return (
    <div>
      {s.onRepeat.length > 0 && (
        <>
          <Label note="the last 30 days">On repeat this month</Label>
          <ol className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
            {s.onRepeat.map((t, i) => (
              <li key={`${t.track}|${t.artist}`} className="flex items-center gap-3 lg:block">
                <Preview
                  id={`repeat|${t.track}|${t.artist}`}
                  url={t.preview ?? null}
                  image={t.image ?? null}
                  label={`${t.track} by ${t.artist}`}
                  size={56}
                  className="lg:!w-full"
                />
                <a href={t.url} target="_blank" rel="noopener noreferrer" className="block min-w-0 hover:underline lg:mt-2">
                  <span className="block truncate font-semibold">
                    <span className="tnum mr-2 text-quiet">{i + 1}</span>
                    {t.track}
                  </span>
                  <span className="block truncate text-quiet">
                    {t.artist}, {fmtNum(t.plays)} {t.plays === 1 ? "play" : "plays"}
                  </span>
                </a>
              </li>
            ))}
          </ol>
          {s.topArtists[0] ? (
            <p className="mt-4 text-quiet">
              Most played artist: <span className="text-ink">{s.topArtists[0].name}</span>, {fmtNum(s.topArtists[0].plays)} plays
            </p>
          ) : null}
        </>
      )}

      {s.clock && (
        <>
          <Label note={peak != null ? `mostly around ${String(peak).padStart(2, "0")}:00` : undefined}>When I listen</Label>
          <div className="grid grid-cols-[repeat(24,1fr)] items-end gap-[3px]" style={{ height: 96 }} role="img" aria-label={`Plays by hour of the day over the last ${s.windowDays} days, most around ${peak}:00`}>
            {s.clock.map((n, h) => (
              <span
                key={h}
                title={`${String(h).padStart(2, "0")}:00, ${fmtNum(n)} plays`}
                className={`block w-full ${h === hourNow ? "bg-ink" : "bg-ink/25"}`}
                style={{ height: `${Math.max(2, (n / max) * 100)}%` }}
              />
            ))}
          </div>
          <div className="tnum mt-1 grid grid-cols-4 text-[11px] text-quiet">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {s.streakDays != null && (
              <div className="border-t border-ink pt-1.5">
                <dt className="text-quiet">In a row</dt>
                <dd className="tnum text-[28px] leading-tight font-semibold">
                  {s.streakCapped ? `${s.streakDays}+` : s.streakDays} {s.streakDays === 1 ? "day" : "days"}
                </dd>
              </div>
            )}
            {s.windowPlays != null && (
              <div className="border-t border-ink pt-1.5">
                <dt className="text-quiet">Last {s.windowDays} days</dt>
                <dd className="tnum text-[28px] leading-tight font-semibold">{fmtNum(s.windowPlays)} plays</dd>
              </div>
            )}
            {s.totalPlays != null && (
              <div className="border-t border-ink pt-1.5">
                <dt className="text-quiet">All time{s.since ? `, since ${new Date(s.since).getFullYear()}` : ""}</dt>
                <dd className="tnum text-[28px] leading-tight font-semibold">{fmtNum(s.totalPlays)} plays</dd>
              </div>
            )}
          </dl>
        </>
      )}
    </div>
  );
}
