"use client";

import { useNow, useSaved } from "@/lib/presence/client";
import { timeAgo } from "@/lib/time";

/** Loose contact-sheet rhythm: each column sits at a slightly different height. */
const DROP = ["0rem", "5rem", "1.5rem", "8rem"];

/**
 * What I've been saving on Pinterest: the latest pins on the same loose grid
 * as the photographs, each captioned with its board and when I saved it,
 * then the boards those saves went to. Everything links back to Pinterest.
 */
export function Saved() {
  const saved = useSaved();
  const now = useNow();

  if (!saved) return <div className="min-h-[40vh]" aria-hidden />;

  if (!saved.pins.length) {
    return (
      <p className="max-w-[40ch] border-t border-ink pt-1.5 text-[17px] leading-snug">
        My boards live on{" "}
        <a href={saved.profile} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-4">
          Pinterest
        </a>
        .
      </p>
    );
  }

  const pins = saved.pins.slice(0, 8);

  return (
    <>
      <ul className="grid grid-cols-2 items-start gap-4 md:grid-cols-4">
        {pins.map((p, i) => (
          <li key={p.id} style={{ "--d": DROP[i % 4] } as React.CSSProperties} className="md:[margin-top:var(--d)]">
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="group block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imageSmall}
                srcSet={`${p.imageSmall} 474w, ${p.image} 736w`}
                sizes="(min-width: 768px) 25vw, 50vw"
                width={p.width}
                height={p.height}
                alt={p.title ?? `A pin saved${p.board ? ` to ${p.board}` : ""}`}
                loading="lazy"
                decoding="async"
                className="h-auto w-full"
                style={{ backgroundColor: p.color ?? "#e6e6e6", aspectRatio: `${p.width} / ${p.height}` }}
              />
              <span className="mt-1.5 block text-[12px] leading-snug text-quiet group-hover:text-ink">
                {[p.board, p.at && now ? timeAgo(p.at, now) : null].filter(Boolean).join(", ")}
              </span>
            </a>
          </li>
        ))}
      </ul>

      {saved.boards.length > 0 && (
        <ul className="mt-20">
          {saved.boards.map((b) => (
            <li key={b.url}>
              <a
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="grid grid-cols-2 gap-x-4 border-t border-ink py-2.5 md:grid-cols-4"
              >
                <span className="col-span-2 font-semibold md:col-span-1">{b.name}</span>
                <span className="text-quiet md:col-span-2 md:text-ink">
                  {b.recent} recent {b.recent === 1 ? "save" : "saves"}
                </span>
                <span className="tnum text-right text-quiet">
                  {b.lastSaved && now ? `saved ${timeAgo(b.lastSaved, now)}` : ""}
                </span>
              </a>
            </li>
          ))}
          <li>
            <a
              href={saved.profile}
              target="_blank"
              rel="noopener noreferrer"
              className="block border-t border-ink py-2.5 underline-offset-4 hover:underline"
            >
              All boards on Pinterest
            </a>
          </li>
        </ul>
      )}
    </>
  );
}
