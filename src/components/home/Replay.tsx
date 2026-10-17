"use client";

import { useReplay } from "@/lib/presence/client";
import { fmtNum } from "@/lib/time";
import { Label } from "@/components/site/Label";
import { Cover } from "@/components/live/Cover";
import { BigNumber, Fact, MonthChart, RankList } from "@/components/stats/Stats";

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/**
 * The year so far, the way music apps do a year-end recap, except it's live
 * and refreshes through the day. Read from the history store, so it's only as
 * complete as the store; when the store doesn't reach back to January yet, it
 * says so.
 */
export function Replay() {
  const r = useReplay();
  // Room for it while it loads, so the page below doesn't jump when it lands.
  if (!r) return <div className="min-h-[70vh]" aria-hidden />;
  if (!r.summary.music.plays) return null;
  const m = r.summary.music;
  const partial = r.storeFrom && r.storeFrom.slice(0, 10) > `${r.year}-01-01`;
  const hours = m.minutes >= 600;
  const song = m.topTracks[0];
  const currentMonth = new Date().getMonth();

  return (
    <div>
      <Label as="h2" note={partial ? `counting from ${longDate(r.storeFrom!)}, when my history starts` : "refreshes through the day"}>{r.year} so far</Label>

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-12">
        <div className="md:col-span-7">
          <BigNumber
            size="xl"
            label="Listening this year"
            value={fmtNum(hours ? Math.round(m.minutes / 60) : m.minutes)}
            unit={hours ? "hours" : "minutes"}
            sub="About: worked out from each song's length."
          />
        </div>
        <div className="grid grid-cols-2 content-end gap-4 md:col-span-5">
          <BigNumber label="Plays" value={fmtNum(m.plays)} size="md" />
          <BigNumber label="Songs" value={fmtNum(m.songs)} size="md" />
          <BigNumber label="Artists" value={fmtNum(m.artists)} size="md" />
          <BigNumber label="Days with music" value={fmtNum(m.byDay.length)} size="md" />
        </div>
      </div>

      {song && (
        <div className="mt-16 grid grid-cols-[auto_1fr] items-end gap-5 border-t border-ink pt-4 md:gap-8">
          <Cover url={song.image} px={176} className="!w-28 md:!w-44" />
          <div className="min-w-0">
            <p className="text-quiet">Song of the year, so far</p>
            <p className="mt-1 text-[clamp(1.75rem,4.5vw,3.75rem)] leading-[0.95] font-extrabold tracking-[-0.035em]">
              {song.url ? (
                <a href={song.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {song.track}
                </a>
              ) : (
                song.track
              )}
            </p>
            <p className="mt-2 text-[17px]">
              {song.artist} <span className="text-quiet">· {fmtNum(song.plays)} plays</span>
            </p>
          </div>
        </div>
      )}

      <div className="mt-16 grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-3">
        <section>
          <h3 className="mb-2 font-semibold">Top songs</h3>
          <RankList
            cover={36}
            start={2}
            items={m.topTracks.slice(1, 10).map((t) => ({ key: `${t.track}|${t.artist}`, title: t.track, sub: t.artist, count: t.plays, image: t.image, url: t.url }))}
          />
        </section>
        <section>
          <h3 className="mb-2 font-semibold">Top artists</h3>
          <RankList items={m.topArtists.slice(0, 10).map((a) => ({ key: a.name, title: a.name, count: a.plays }))} />
        </section>
        <section>
          <h3 className="mb-2 font-semibold">Month by month</h3>
          <MonthChart byMonth={r.byMonth} current={currentMonth} />
          <div className="mt-6">
            {r.busiestDay && <Fact k="Busiest day" v={`${longDate(`${r.busiestDay.day}T12:00:00Z`)}, ${fmtNum(r.busiestDay.plays)} plays`} />}
            {r.longestStreak > 1 && <Fact k="Longest run" v={`${r.longestStreak} days in a row`} />}
            {m.topAlbums[0] && <Fact k="Top album" v={m.topAlbums[0].album} />}
            {r.firstPlay && !partial && <Fact k="First song of the year" v={`${r.firstPlay.track}, ${r.firstPlay.artist}`} />}
          </div>
        </section>
      </div>
    </div>
  );
}
