"use client";

import { useMusic, useNow } from "@/lib/presence/client";
import { timeAgo } from "@/lib/time";
import { USUALLY_ON } from "@/content/story";
import { Playing } from "@/components/live/Playing";

/**
 * What I'm actually listening to, like the back of a record sleeve: one ruled
 * row per song, newest first, each song once. It updates on its own while
 * the page is open. Rows open the song on Apple Music.
 */
export function Listening() {
  const music = useMusic();
  const now = useNow();
  const tracks = music?.tracks ?? null;

  if (!tracks || tracks.length === 0) {
    return (
      <p className="max-w-[40ch] border-t border-ink pt-1.5 text-[17px] leading-snug">
        Usually on: {USUALLY_ON.join(", ")}. The live tracklist appears here once my listening is connected.
      </p>
    );
  }

  return (
    <ol aria-live="polite">
      {tracks.map((t) => (
        <li key={`${t.track}|${t.artist}`}>
          <a
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid grid-cols-[3rem_1fr_auto] items-center gap-x-4 border-t border-ink py-2.5 md:grid-cols-[3rem_1fr_1fr_1fr]"
          >
            {t.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.image}
                alt=""
                width={48}
                height={48}
                decoding="async"
                className="row-span-2 aspect-square w-12 bg-[#e6e6e6] object-cover md:row-span-1"
              />
            ) : (
              <span aria-hidden className="row-span-2 aspect-square w-12 bg-[#e6e6e6] md:row-span-1" />
            )}
            <span className="truncate font-semibold">{t.track}</span>
            <span className="tnum row-span-2 text-right text-quiet md:order-last md:row-span-1">
              {t.nowPlaying ? (
                <span className="inline-flex items-center gap-2 text-ink">
                  <Playing />
                  playing
                </span>
              ) : t.at && now ? (
                timeAgo(t.at, now)
              ) : null}
            </span>
            <span className="truncate text-quiet md:text-ink">{t.artist}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}
