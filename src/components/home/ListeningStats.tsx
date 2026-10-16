"use client";

import { useListening, useNow, usePresence } from "@/lib/presence/client";
import { fmtNum, hourIn } from "@/lib/time";
import { Label } from "@/components/site/Label";
import { BigNumber, HourChart, RankList } from "@/components/stats/Stats";

/**
 * This month in listening: what's on repeat (press a cover to hear it), the
 * artist I can't stop playing, how many days in a row, and when in the day I
 * actually listen.
 */
export function ListeningStats() {
  const s = useListening();
  const presence = usePresence();
  const now = useNow();
  if (!s) return null;
  const nowHour = now ? hourIn(presence?.place.tz ?? "Asia/Kolkata", new Date(now)) : null;
  const top = s.topArtists[0];

  return (
    <div>
      {s.onRepeat.length > 0 && (
        <>
          <Label note="the last 30 days">On repeat this month</Label>
          <div className="grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-12">
            <div className="md:col-span-7">
              <RankList
                cover={48}
                items={s.onRepeat.map((t) => ({
                  key: `${t.track}|${t.artist}`,
                  title: t.track,
                  sub: t.artist,
                  count: t.plays,
                  image: t.image ?? null,
                  url: t.url ?? null,
                  preview: t.preview ?? null,
                }))}
              />
            </div>
            <div className="grid grid-cols-2 content-start gap-x-4 gap-y-8 md:col-span-5">
              {top ? (
                <div className="col-span-2">
                  <BigNumber label="Most played artist" value={top.name} size="md" sub={`${fmtNum(top.plays)} plays this month`} />
                </div>
              ) : null}
              {s.streakDays != null && (
                <BigNumber label="In a row" value={`${s.streakDays}${s.streakCapped ? "+" : ""}`} unit={s.streakDays === 1 ? "day" : "days"} />
              )}
              {s.windowPlays != null && <BigNumber label={`Last ${s.windowDays} days`} value={fmtNum(s.windowPlays)} unit="plays" />}
              {s.totalPlays != null && (
                <div className="col-span-2">
                  <BigNumber
                    label="All time"
                    value={fmtNum(s.totalPlays)}
                    unit="plays"
                    sub={s.since ? `since ${new Date(s.since).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}` : undefined}
                    size="md"
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {s.clock && s.clock.some(Boolean) && (
        <>
          <Label note={`the last ${s.windowDays} days, India time`}>When I listen</Label>
          <HourChart clock={s.clock} nowHour={nowHour} />
        </>
      )}
    </div>
  );
}
