import type { RangeSummary } from "@/lib/history/query";
import { fmtMinutes, fmtNum } from "@/lib/time";
import { BigNumber, DayChart, Fact, HourChart, RankList } from "@/components/stats/Stats";

const head = "mb-2 font-semibold";

/**
 * Any stretch of time from the history store, laid out like a magazine
 * spread: the big numbers, the top tens, the shape of the listening, then
 * Pinterest, code and movement. Parts with nothing in them are left out.
 */
export function RangeView({ s, top = 10 }: { s: RangeSummary; top?: number }) {
  const m = s.music;
  const days = Math.max(1, Math.round((Date.parse(s.to) - Date.parse(s.from)) / 86400_000));

  const numbers = [
    m.plays ? { k: "Listening", v: fmtMinutes(m.minutes), sub: "about, from song lengths" } : null,
    m.plays ? { k: "Plays", v: fmtNum(m.plays), sub: days > 1 ? `${m.plays / days < 10 ? (m.plays / days).toFixed(1) : fmtNum(Math.round(m.plays / days))} a day` : undefined } : null,
    m.songs ? { k: "Songs", v: fmtNum(m.songs), sub: m.newSongs ? `${fmtNum(m.newSongs)} heard for the first time` : undefined } : null,
    m.artists ? { k: "Artists", v: fmtNum(m.artists), sub: m.newArtists ? `${fmtNum(m.newArtists)} new to me` : undefined } : null,
    s.pins.count ? { k: "Pins saved", v: fmtNum(s.pins.count) } : null,
    s.code.pushes ? { k: "Pushes", v: fmtNum(s.code.pushes), sub: `to ${s.code.repos.length} ${s.code.repos.length === 1 ? "repo" : "repos"}` } : null,
    s.activity.count ? { k: "Moved", v: s.activity.km ? `${s.activity.km} km` : `${s.activity.count}×`, sub: fmtMinutes(s.activity.minutes) } : null,
    s.health.avgSteps ? { k: "Steps a day", v: fmtNum(s.health.avgSteps) } : null,
  ].filter((x): x is { k: string; v: string; sub?: string } => !!x);

  if (!numbers.length) return <p className="border-t border-ink pt-1.5 text-quiet">Nothing stored for this stretch yet.</p>;

  return (
    <div className="space-y-16">
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
        {numbers.map((n) => (
          <BigNumber key={n.k} label={n.k} value={n.v} sub={n.sub} />
        ))}
      </div>

      {m.plays > 0 && (
        <>
          <section className="grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-3">
            <div>
              <h3 className={head}>Top {Math.min(top, m.topTracks.length)} songs</h3>
              <RankList
                cover={36}
                items={m.topTracks.slice(0, top).map((t) => ({ key: `${t.track}|${t.artist}`, title: t.track, sub: t.artist, count: t.plays, image: t.image, url: t.url }))}
              />
            </div>
            <div>
              <h3 className={head}>Top {Math.min(top, m.topArtists.length)} artists</h3>
              <RankList items={m.topArtists.slice(0, top).map((a) => ({ key: a.name, title: a.name, count: a.plays }))} />
            </div>
            <div>
              <h3 className={head}>Top albums</h3>
              <RankList
                cover={36}
                items={m.topAlbums.map((a) => ({ key: `${a.album}|${a.artist}`, title: a.album, sub: a.artist, count: a.plays, image: a.image }))}
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-2">
            <div>
              <h3 className={head}>Day by day</h3>
              <DayChart byDay={m.byDay} />
            </div>
            <div>
              <h3 className={head}>Hour by hour</h3>
              <HourChart clock={m.clock} height={120} />
              {m.known < 0.9 && (
                <p className="mt-3 text-[12px] text-quiet">
                  Minutes are estimated: {Math.round(m.known * 100)}% of plays have a known song length so far.
                </p>
              )}
            </div>
          </section>
        </>
      )}

      {s.pins.count > 0 && (
        <section>
          <h3 className={head}>Saved on Pinterest</h3>
          {s.pins.palette.length > 2 && (
            <div className="mb-2 flex h-8 outline outline-1 -outline-offset-1 outline-ink/10" role="img" aria-label="The colours of the pins I saved">
              {s.pins.palette.map((c, i) => (
                <span key={i} className="block flex-1" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
          {s.pins.palette.length > 2 && <p className="mb-6 text-[12px] text-quiet">The colours of what I saved, newest first</p>}
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-3">
            <RankList unit="pins" items={s.pins.boards.map((b) => ({ key: b.url, title: b.name, count: b.count, url: b.url }))} />
            <ul className="grid grid-cols-4 gap-2 md:col-span-2 md:grid-cols-8">
              {s.pins.picks.map((p) => (
                <li key={p.id}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageSmall} alt={p.title ?? "A pin I saved, on Pinterest"} loading="lazy" className="aspect-[3/4] w-full object-cover" style={{ backgroundColor: p.color ?? "#e6e6e6" }} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {(s.code.pushes > 0 || s.activity.count > 0 || s.health.days > 0) && (
        <section className="grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-3">
          {s.code.pushes > 0 && (
            <div>
              <h3 className={head}>Code</h3>
              <RankList
                unit="pushes"
                items={s.code.repos.map((r) => ({ key: r.name, title: r.name, count: r.pushes, url: `https://github.com/once-human/${r.name}` }))}
              />
            </div>
          )}
          {s.activity.count > 0 && (
            <div>
              <h3 className={head}>Moving</h3>
              {s.activity.byType.map((a) => (
                <Fact key={a.type} k={a.type} v={`${a.count}×${a.km ? `, ${a.km} km` : ""}`} />
              ))}
              <Fact k="Time moving" v={fmtMinutes(s.activity.minutes)} />
            </div>
          )}
          {s.health.days > 0 && (
            <div>
              <h3 className={head}>Body</h3>
              {s.health.steps != null && <Fact k="Steps" v={fmtNum(s.health.steps)} />}
              {s.health.avgSteps != null && <Fact k="A day, on average" v={fmtNum(s.health.avgSteps)} />}
              {s.health.avgSleep != null && <Fact k="Sleep a night" v={`${s.health.avgSleep} h`} />}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
