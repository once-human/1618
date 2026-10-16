"use client";

import { usePresence, useNow } from "@/lib/presence/client";
import { puneNow } from "@/lib/time";
import { profile } from "@/content/profile";

const cell = "border-t border-ink pt-1.5";

/**
 * Fixed footer. Everything on the right is live: the real time and weather in
 * Pune, and the song playing right now when there is one.
 */
export function Footer() {
  const now = useNow();
  const presence = usePresence();
  const playing = presence?.music?.find((t) => t.nowPlaying);
  const weather = presence?.weather;
  const pune = now ? puneNow(new Date(now)) : null;

  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-2 gap-4 bg-paper px-4 pt-2 pb-3 text-[13px] md:grid-cols-4">
      <p className={`${cell} truncate`}>
        {profile.name}
        <span className="hidden md:inline">, {profile.role.toLowerCase()}</span>
      </p>
      <p className={`${cell} hidden md:block`}>
        {profile.links.github && (
          <a href={profile.links.github} target="_blank" rel="noopener noreferrer" className="hover:underline">
            github
          </a>
        )}
      </p>
      <p className={`${cell} hidden truncate md:block`} aria-live="polite">
        {playing ? (
          <a href={playing.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            Now playing {playing.track}, {playing.artist}
          </a>
        ) : null}
      </p>
      <p className={`${cell} tnum text-right`}>
        {pune ? (
          <>
            Pune, {pune.label}
            {weather ? `, ${weather.tempC}°` : ""}
            <span className="hidden md:inline">{weather?.label ? ` ${weather.label}` : ""}</span>
          </>
        ) : (
          "Pune"
        )}
      </p>
    </footer>
  );
}
