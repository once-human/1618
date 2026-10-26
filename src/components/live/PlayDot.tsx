"use client";

import { togglePreview, usePlayer } from "@/lib/presence/client";
import { track } from "@/lib/visits/client";

/** A small play button for a song named in a line of text. Nothing plays on its own. */
export function PlayDot({ id, url, label, className = "" }: { id: string; url: string | null | undefined; label: string; className?: string }) {
  const p = usePlayer();
  if (!url) return null;
  const on = p.key === id && p.playing;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!on) track("played a preview", label);
        togglePreview(id, url);
      }}
      aria-label={`${on ? "Pause" : "Play"} a preview of ${label}`}
      aria-pressed={on}
      className={`border-ink hover:bg-ink hover:text-paper inline-grid size-[1.15em] shrink-0 place-items-center border align-[-0.12em] text-[0.7em] leading-none ${on ? "bg-ink text-paper" : ""} ${className}`}
    >
      {on ? (
        <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" aria-hidden><rect x="2" y="1" width="3" height="10" /><rect x="7" y="1" width="3" height="10" /></svg>
      ) : (
        <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" aria-hidden><path d="M2 1l9 5-9 5z" /></svg>
      )}
    </button>
  );
}
