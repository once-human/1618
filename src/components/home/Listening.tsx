"use client";

import { usePresence, useNow } from "@/lib/presence/client";
import { timeAgo } from "@/lib/time";
import { USUALLY_ON } from "@/content/story";

/**
 * What I'm actually listening to, like the back of a record sleeve: one ruled
 * row per track, newest first. Only real plays are shown. With no live source
 * connected it says what's usually on instead, and doesn't pretend.
 */
export function Listening() {
  const presence = usePresence();
  const now = useNow();
  const tracks = presence?.music ?? null;

  if (!tracks || tracks.length === 0) {
    return (
      <p className="max-w-[40ch] border-t border-ink pt-1.5 text-[17px] leading-snug">
        Usually on: {USUALLY_ON.join(", ")}. The live tracklist appears here once my listening is connected.
      </p>
    );
  }

  const rows = tracks.slice(0, 10);

  return (
    <ol>
      {rows.map((t, i) => (
        <li key={`${t.track}-${t.at ?? "now"}-${i}`}>
          <a
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid grid-cols-[3rem_1fr] items-center gap-x-4 border-t border-ink py-2.5 md:grid-cols-[3rem_1fr_1fr_1fr]"
          >
            {t.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.image} alt="" width={48} height={48} loading="lazy" className="row-span-2 aspect-square w-12 object-cover md:row-span-1" />
            ) : (
              <span aria-hidden className="row-span-2 aspect-square w-12 bg-[#e6e6e6] md:row-span-1" />
            )}
            <span className="truncate font-semibold">{t.track}</span>
            <span className="truncate text-quiet md:text-ink">{t.artist}</span>
            <span className="tnum hidden text-right text-quiet md:block">
              {t.nowPlaying ? "now playing" : t.at && now ? timeAgo(t.at, now) : ""}
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}
