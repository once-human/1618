"use client";

import { useEffect, useState } from "react";
import { useNow } from "@/lib/presence/client";
import { timeAgo } from "@/lib/time";

/** A random code this browser keeps, so it can be told when I play a song it sent me. */
export function senderToken(): string | null {
  try {
    let t = localStorage.getItem("sender");
    if (!t || !/^[a-f0-9]{32}$/.test(t)) {
      t = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem("sender", t);
    }
    return t;
  } catch {
    return null;
  }
}

interface Mine {
  id: number;
  track: string;
  artist: string;
  link: string;
  played: { n: number; first: string } | null;
}

const readSeen = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem("played-seen") ?? "{}");
  } catch {
    return {};
  }
};

/**
 * If you sent me a song and I've played it since, the next time you visit
 * you're told so. Once per new play count; dismissing it is remembered.
 */
export function PlayedYourSong() {
  const [news, setNews] = useState<Mine | null>(null);
  const now = useNow();

  useEffect(() => {
    let sender: string | null = null;
    try {
      if (!localStorage.getItem("sent-songs")) return;
      sender = localStorage.getItem("sender");
    } catch {
      return;
    }
    if (!sender) return;
    let live = true;
    fetch("/api/songs/mine", { method: "POST", body: JSON.stringify({ sender }) })
      .then((r) => r.json())
      .then((list: Mine[]) => {
        const seen = readSeen();
        const fresh = list.find((s) => s.played && s.played.n > (seen[s.id] ?? 0));
        if (live && fresh) setNews(fresh);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!news?.played) return null;
  const close = () => {
    try {
      localStorage.setItem("played-seen", JSON.stringify({ ...readSeen(), [news.id]: news.played!.n }));
    } catch {
      /* fine */
    }
    setNews(null);
  };
  return (
    <div role="status" className="bg-ink text-paper fixed right-4 bottom-14 left-4 z-50 mx-auto flex max-w-[560px] items-start gap-4 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <p className="flex-1 leading-snug">
        I played{" "}
        <a href={news.link} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">
          {news.track}
        </a>
        , the song you sent me, {news.played.n === 1 ? "once" : `${news.played.n} times`}
        {now ? `, first ${timeAgo(news.played.first, now)}` : ""}. Thank you 🖤
      </p>
      <button type="button" onClick={close} className="text-paper/70 hover:text-paper" aria-label="Close">
        ✕
      </button>
    </div>
  );
}
