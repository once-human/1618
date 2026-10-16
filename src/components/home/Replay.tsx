"use client";

import { useReplay } from "@/lib/presence/client";
import { fmtNum } from "@/lib/time";
import { Label } from "@/components/site/Label";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * The year so far, the way music apps do a year-end recap, except it's live
 * and refreshes through the day. Read from the history store, so it's only as
 * complete as the store; when the store doesn't reach back to January yet, it
 * says so.
 */
export function Replay() {
  const r = useReplay();
  if (!r || !r.summary.music.plays) return null;
  const m = r.summary.music;
  const yearStart = `${r.year}-01-01`;
  const partial = r.storeFrom && r.storeFrom.slice(0, 10) > yearStart;
  const maxMonth = Math.max(1, ...r.byMonth.map((x) => x.plays));
  const byMonth = new Map(r.byMonth.map((x) => [Number(x.month.slice(5)) - 1, x]));

  const stats = [
    { k: "Minutes", v: `about ${fmtNum(m.minutes)}` },
    { k: "Plays", v: fmtNum(m.plays) },
    { k: "Songs", v: fmtNum(m.songs) },
    { k: "Artists", v: fmtNum(m.artists) },
  ];

  return (
    <div>
      <Label note={partial ? `counting from ${new Date(r.storeFrom!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "updates every few hours"}>
        {r.year} so far
      </Label>

      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="border-t border-ink pt-1.5">
            <dt className="text-quiet">{s.k}</dt>
            <dd className="tnum text-[clamp(1.75rem,4vw,3rem)] leading-tight font-semibold tracking-tight">{s.v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
        <div>
          <p className="mb-2 border-t border-ink pt-1.5 font-semibold">Top songs</p>
          <ol className="space-y-2">
            {m.topTracks.slice(0, 5).map((t, i) => (
              <li key={`${t.track}|${t.artist}`} className="flex items-center gap-3">
                {t.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.image} alt="" width={40} height={40} className="aspect-square w-10 shrink-0 bg-[#e6e6e6] object-cover" />
                ) : (
                  <span aria-hidden className="aspect-square w-10 shrink-0 bg-[#e6e6e6]" />
                )}
                <span className="min-w-0">
                  <span className="block truncate">
                    <span className="tnum mr-2 text-quiet">{i + 1}</span>
                    {t.url ? (
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {t.track}
                      </a>
                    ) : (
                      t.track
                    )}
                  </span>
                  <span className="block truncate text-[13px] text-quiet">
                    {t.artist}, {fmtNum(t.plays)} plays
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="mb-2 border-t border-ink pt-1.5 font-semibold">Top artists</p>
          <ol className="space-y-1">
            {m.topArtists.slice(0, 7).map((a, i) => (
              <li key={a.name} className="flex justify-between gap-3">
                <span className="truncate">
                  <span className="tnum mr-2 text-quiet">{i + 1}</span>
                  {a.name}
                </span>
                <span className="tnum shrink-0 text-quiet">{fmtNum(a.plays)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="mb-2 border-t border-ink pt-1.5 font-semibold">Month by month</p>
          <div className="grid h-24 grid-cols-12 items-end gap-1" role="img" aria-label="Plays per month">
            {MONTHS.map((label, i) => {
              const x = byMonth.get(i);
              return (
                <span
                  key={i}
                  title={x ? `${x.plays} plays${x.topArtist ? `, mostly ${x.topArtist}` : ""}` : "no plays"}
                  className="block bg-ink"
                  style={{ height: `${x ? Math.max(3, (x.plays / maxMonth) * 100) : 1}%`, opacity: x ? 1 : 0.15 }}
                />
              );
            })}
          </div>
          <div className="mt-1 grid grid-cols-12 gap-1 text-center text-[11px] text-quiet">
            {MONTHS.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
          <ul className="mt-4 space-y-1 text-[14px]">
            {r.busiestDay && (
              <li>
                <span className="text-quiet">Busiest day: </span>
                {new Date(`${r.busiestDay.day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })},{" "}
                {fmtNum(r.busiestDay.plays)} plays
              </li>
            )}
            {r.longestStreak > 1 && (
              <li>
                <span className="text-quiet">Longest run: </span>
                {r.longestStreak} days in a row
              </li>
            )}
            {r.firstPlay && !partial && (
              <li>
                <span className="text-quiet">First song of the year: </span>
                {r.firstPlay.track}, {r.firstPlay.artist}
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
