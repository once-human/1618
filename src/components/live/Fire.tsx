"use client";

import { useState } from "react";

/**
 * 🔥 for the song that's playing right now. One per song per visitor every
 * ten minutes; the count is shared by everyone.
 */
export function Fire({ track, artist, count }: { track: string; artist: string; count: number | null }) {
  const [mine, setMine] = useState<{ key: string; n: number } | null>(null);
  const key = `${track}|${artist}`;
  const done = mine?.key === key;
  const n = done ? Math.max(mine.n, count ?? 0) : (count ?? 0);

  async function send() {
    if (done) return;
    setMine({ key, n: (count ?? 0) + 1 });
    try {
      const res = await fetch("/api/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track, artist }),
      });
      const d = (await res.json()) as { fire: number | null };
      if (typeof d.fire === "number") setMine({ key, n: d.fire });
    } catch {
      /* keep the optimistic count */
    }
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={done}
      aria-label={done ? `You sent fire to ${track}` : `Send fire to ${track}`}
      className={`tnum inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] leading-none transition ${
        done ? "border-ink bg-ink text-paper" : "border-ink/30 hover:border-ink"
      }`}
    >
      <span aria-hidden className={done ? "" : "grayscale"}>🔥</span>
      {n > 0 ? n : null}
    </button>
  );
}
