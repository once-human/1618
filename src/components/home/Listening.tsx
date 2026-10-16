"use client";

import { useMusic, useNow } from "@/lib/presence/client";
import { timeAgo } from "@/lib/time";
import { USUALLY_ON } from "@/content/story";
import { Playing } from "@/components/live/Playing";
import { Preview } from "@/components/live/Preview";
import { Fire } from "@/components/live/Fire";
import { Progress } from "@/components/live/Progress";
import { ListeningStats } from "./ListeningStats";
import { Replay } from "./Replay";
import { SendSong } from "./SendSong";

/**
 * What I'm actually listening to, like the back of a record sleeve: one ruled
 * row per song, newest first, each song once. Press a cover to hear 30
 * seconds of it. The playing song shows roughly how far in I am and takes 🔥.
 * Below: what's on repeat, when I listen, the year so far, and a way to send
 * me a song.
 */
export function Listening() {
  const music = useMusic();
  const now = useNow();
  const tracks = music?.tracks ?? null;

  return (
    <div>
      {!tracks || tracks.length === 0 ? (
        <p className="max-w-[40ch] border-t border-ink pt-1.5 text-[17px] leading-snug">
          Usually on: {USUALLY_ON.join(", ")}. The live tracklist appears here once my listening is connected.
        </p>
      ) : (
        <ol aria-live="polite">
          {tracks.map((t) => {
            const id = `${t.track}|${t.artist}`;
            const isNew = t.firstHeard && now ? Date.parse(t.firstHeard) > now - 14 * 86400_000 : false;
            return (
              <li key={id} className="border-t border-ink py-2.5">
                <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-x-4 md:grid-cols-[3rem_1fr_1fr_1fr]">
                  <Preview id={id} url={t.preview} image={t.image} label={`${t.track} by ${t.artist}`} className="row-span-2 md:row-span-1" />
                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-semibold hover:underline">
                    {t.track}
                    {isNew ? (
                      <span className="ml-2 align-[0.1em] text-[11px] font-normal tracking-wide text-quiet uppercase" title={`First heard ${timeAgo(t.firstHeard!, now)}`}>
                        new to me
                      </span>
                    ) : null}
                  </a>
                  <span className="tnum row-span-2 flex items-center justify-end gap-3 text-right text-quiet md:order-last md:row-span-1">
                    {t.nowPlaying ? (
                      <>
                        <Fire track={t.track} artist={t.artist} count={t.fire} />
                        <span className="inline-flex items-center gap-2 text-ink" style={t.tint ? { color: t.tint } : undefined}>
                          <Playing />
                          <span className="text-ink">playing</span>
                        </span>
                      </>
                    ) : t.at && now ? (
                      timeAgo(t.at, now)
                    ) : null}
                  </span>
                  <span className="min-w-0 truncate text-quiet md:text-ink">{t.artist}</span>
                </div>
                {t.nowPlaying && t.startedAt && t.durationMs ? (
                  <div className="mt-2 md:ml-[4rem]">
                    <Progress startedAt={t.startedAt} durationMs={t.durationMs} tint={t.tint} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <ListeningStats />
      <Replay />
      <SendSong />
    </div>
  );
}
