import type { RangeSummary } from "@/lib/history/query";
import { fmtMinutes, fmtNum } from "@/lib/time";

const cell = "border-t border-ink pt-1.5";

/**
 * Any stretch of time from the history store, laid out like a magazine
 * spread: big numbers first, then music, Pinterest, code and movement. Parts
 * with nothing in them are left out rather than shown empty.
 */
export function RangeView({ s }: { s: RangeSummary }) {
  const m = s.music;
  const maxDay = Math.max(1, ...m.byDay.map((d) => d.plays));
  const maxHour = Math.max(1, ...m.clock);

  const numbers = [
    m.plays ? { k: "Plays", v: fmtNum(m.plays) } : null,
    m.plays ? { k: "Listening", v: `about ${fmtMinutes(m.minutes)}` } : null,
    m.songs ? { k: "Songs", v: fmtNum(m.songs) } : null,
    m.artists ? { k: "Artists", v: fmtNum(m.artists) } : null,
    s.pins.count ? { k: "Pins saved", v: fmtNum(s.pins.count) } : null,
    s.code.pushes ? { k: "Pushes", v: fmtNum(s.code.pushes) } : null,
    s.activity.count ? { k: "Moved", v: s.activity.km ? `${s.activity.km} km` : `${s.activity.count}×` } : null,
    s.health.avgSteps ? { k: "Steps a day", v: fmtNum(s.health.avgSteps) } : null,
  ].filter((x): x is { k: string; v: string } => !!x);

  if (!numbers.length) return <p className={`${cell} text-quiet`}>Nothing stored for this stretch yet.</p>;

  return (
    <div className="space-y-16">
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {numbers.map((n) => (
          <div key={n.k} className={cell}>
            <dt className="text-quiet">{n.k}</dt>
            <dd className="tnum text-[clamp(1.75rem,4vw,3rem)] leading-tight font-semibold tracking-tight">{n.v}</dd>
          </div>
        ))}
      </dl>

      {m.plays > 0 && (
        <section className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <h3 className={`${cell} mb-2 font-semibold`}>Top songs</h3>
            <ol className="space-y-2">
              {m.topTracks.map((t, i) => (
                <li key={`${t.track}|${t.artist}`} className="flex items-center gap-3">
                  {t.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.image} alt="" width={36} height={36} loading="lazy" className="aspect-square w-9 shrink-0 bg-[#e6e6e6] object-cover" />
                  ) : (
                    <span aria-hidden className="aspect-square w-9 shrink-0 bg-[#e6e6e6]" />
                  )}
                  <span className="min-w-0 text-[14px] leading-snug">
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
                    <span className="block truncate text-quiet">
                      {t.artist}, {fmtNum(t.plays)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className={`${cell} mb-2 font-semibold`}>Top artists</h3>
            <ol className="space-y-1 text-[14px]">
              {m.topArtists.map((a, i) => (
                <li key={a.name} className="flex justify-between gap-3">
                  <span className="truncate">
                    <span className="tnum mr-2 text-quiet">{i + 1}</span>
                    {a.name}
                  </span>
                  <span className="tnum text-quiet">{fmtNum(a.plays)}</span>
                </li>
              ))}
            </ol>
            {m.topAlbums.length > 0 && (
              <>
                <h3 className={`${cell} mt-8 mb-2 font-semibold`}>Top albums</h3>
                <ol className="space-y-1 text-[14px]">
                  {m.topAlbums.map((a) => (
                    <li key={`${a.album}|${a.artist}`} className="truncate">
                      {a.album} <span className="text-quiet">{a.artist}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
          <div>
            <h3 className={`${cell} mb-2 font-semibold`}>Day by day</h3>
            <div className="flex h-24 items-end gap-px" role="img" aria-label="Plays per day">
              {m.byDay.map((d) => (
                <span key={d.day} title={`${d.day}: ${d.plays} plays`} className="block min-w-px max-w-4 flex-1 bg-ink" style={{ height: `${Math.max(2, (d.plays / maxDay) * 100)}%` }} />
              ))}
            </div>
            <h3 className={`${cell} mt-8 mb-2 font-semibold`}>Hour by hour</h3>
            <div className="grid h-16 grid-cols-[repeat(24,1fr)] items-end gap-[2px]" role="img" aria-label="Plays per hour of the day">
              {m.clock.map((n, h) => (
                <span key={h} title={`${String(h).padStart(2, "0")}:00, ${n} plays`} className="block bg-ink/70" style={{ height: `${Math.max(2, (n / maxHour) * 100)}%` }} />
              ))}
            </div>
            <div className="tnum mt-1 grid grid-cols-4 text-[11px] text-quiet">
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
            </div>
            {m.known < 0.9 && <p className="mt-4 text-[12px] text-quiet">Minutes are estimated: {Math.round(m.known * 100)}% of plays have a known song length so far.</p>}
          </div>
        </section>
      )}

      {s.pins.count > 0 && (
        <section>
          <h3 className={`${cell} mb-4 font-semibold`}>Saved on Pinterest</h3>
          {s.pins.palette.length > 2 && (
            <div className="mb-6 flex h-8" role="img" aria-label="Colours of the pins saved">
              {s.pins.palette.map((c, i) => (
                <span key={i} className="block flex-1" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <ol className="space-y-1 text-[14px]">
              {s.pins.boards.map((b) => (
                <li key={b.url} className="flex justify-between gap-3">
                  <a href={b.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                    {b.name}
                  </a>
                  <span className="tnum text-quiet">{b.count}</span>
                </li>
              ))}
            </ol>
            <ul className="grid grid-cols-4 gap-2 md:col-span-3 md:grid-cols-8">
              {s.pins.picks.map((p) => (
                <li key={p.id}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageSmall} alt={p.title ?? ""} loading="lazy" className="aspect-[3/4] w-full object-cover" style={{ backgroundColor: p.color ?? "#e6e6e6" }} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {(s.code.pushes > 0 || s.activity.count > 0 || s.health.days > 0) && (
        <section className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {s.code.pushes > 0 && (
            <div>
              <h3 className={`${cell} mb-2 font-semibold`}>Code</h3>
              <ol className="space-y-1 text-[14px]">
                {s.code.repos.map((r) => (
                  <li key={r.name} className="flex justify-between gap-3">
                    <a href={`https://github.com/once-human/${r.name}`} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                      {r.name}
                    </a>
                    <span className="tnum text-quiet">
                      {r.pushes} {r.pushes === 1 ? "push" : "pushes"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {s.activity.count > 0 && (
            <div>
              <h3 className={`${cell} mb-2 font-semibold`}>Moving</h3>
              <ol className="space-y-1 text-[14px]">
                {s.activity.byType.map((a) => (
                  <li key={a.type} className="flex justify-between gap-3">
                    <span>{a.type}</span>
                    <span className="tnum text-quiet">
                      {a.count}× {a.km ? `, ${a.km} km` : ""}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[13px] text-quiet">{fmtMinutes(s.activity.minutes)} in total</p>
            </div>
          )}
          {s.health.days > 0 && (
            <div>
              <h3 className={`${cell} mb-2 font-semibold`}>Body</h3>
              <ul className="space-y-1 text-[14px]">
                {s.health.steps != null && <li>{fmtNum(s.health.steps)} steps</li>}
                {s.health.avgSleep != null && <li>{s.health.avgSleep} hours of sleep a night</li>}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
