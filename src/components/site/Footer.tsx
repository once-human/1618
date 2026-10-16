"use client";

import Link from "next/link";
import { useMusic, usePresence, useNow } from "@/lib/presence/client";
import { puneNow, timeAgo } from "@/lib/time";
import { Playing } from "@/components/live/Playing";
import { profile } from "@/content/profile";

const cell = "border-t border-ink pt-1.5";

/**
 * Fixed footer. Everything on the right is live: the song playing right now
 * (or the last one and how long ago), and the real time and weather in Pune.
 */
export function Footer() {
  const now = useNow();
  const presence = usePresence();
  const music = useMusic();
  const latest = music?.tracks?.[0];
  const weather = presence?.weather;
  const pune = now ? puneNow(new Date(now)) : null;

  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-2 gap-4 bg-paper px-4 pt-2 pb-3 text-[13px] md:grid-cols-4">
      {/* On phones there's room for two cells: the music line takes the name's place. */}
      <p className={`${cell} truncate ${latest ? "hidden md:block" : ""}`}>
        {profile.name}
        <span className="hidden md:inline">, {profile.role.toLowerCase()}</span>
      </p>
      <p className={`${cell} hidden md:block`}>
        {profile.links.github && (
          <a href={profile.links.github} target="_blank" rel="noopener noreferrer" className="hover:underline">
            github
          </a>
        )}
        <span className="text-quiet">, </span>
        <Link href="/privacy" className="hover:underline">
          privacy
        </Link>
      </p>
      <p className={`${cell} truncate ${latest ? "" : "hidden"} md:block`} aria-live="polite">
        {latest ? (
          <a href={latest.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {latest.nowPlaying ? (
              <>
                <Playing className="mr-1.5" />
                Playing {latest.track}, {latest.artist}
              </>
            ) : (
              <>
                Last played {latest.track}, {latest.artist}
                {latest.at && now ? `, ${timeAgo(latest.at, now)}` : ""}
              </>
            )}
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
