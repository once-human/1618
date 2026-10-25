"use client";

import { togglePreview, usePlayer } from "@/lib/presence/client";
import { artSet } from "@/lib/art";
import { track } from "@/lib/visits/client";

/**
 * A cover you can press to hear 30 seconds of the song. One clip plays at a
 * time across the whole page; nothing ever plays on its own.
 */
export function Preview({
  id,
  url,
  image,
  label,
  size = 48,
  className = "",
}: {
  id: string;
  url: string | null;
  image: string | null;
  label: string;
  size?: number;
  className?: string;
}) {
  const p = usePlayer();
  const active = p.key === id;
  const cover = image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...artSet(image, size)} alt="" width={size} height={size} decoding="async" className="aspect-square w-full bg-[#e6e6e6] object-cover" />
  ) : (
    <span aria-hidden className="block aspect-square w-full bg-[#e6e6e6]" />
  );
  if (!url) return <span className={`block ${className}`} style={{ width: size }}>{cover}</span>;
  return (
    <button
      type="button"
      onClick={() => {
        if (!(active && p.playing)) track("played a preview", label);
        togglePreview(id, url);
      }}
      aria-label={`${active && p.playing ? "Pause" : "Play"} a preview of ${label}`}
      aria-pressed={active && p.playing}
      className={`group relative block shrink-0 ${className}`}
      style={{ width: size }}
    >
      {cover}
      <span
        aria-hidden
        className={`absolute inset-0 flex items-center justify-center bg-ink/45 text-paper transition-opacity ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
        }`}
      >
        {active && p.playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="3" height="10" /><rect x="7" y="1" width="3" height="10" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1l9 5-9 5z" /></svg>
        )}
      </span>
      {active ? (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-paper/40">
          <span className="block h-full bg-paper" style={{ width: `${p.progress * 100}%` }} />
        </span>
      ) : null}
    </button>
  );
}
