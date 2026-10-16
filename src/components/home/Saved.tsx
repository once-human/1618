"use client";

import { useNow, useSaved } from "@/lib/presence/client";
import { timeAgo } from "@/lib/time";
import type { SavedPin } from "@/lib/presence/types";

/** Loose contact-sheet rhythm: each column sits at a slightly different height. */
const DROP = ["0rem", "5rem", "1.5rem", "8rem"];

const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(n);
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

/** A ruled label line that starts each part, with an optional note on the right. */
function Label({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mt-20 mb-6 flex items-baseline justify-between gap-4 border-t border-ink pt-1.5 first:mt-0">
      <h3 className="font-semibold">{children}</h3>
      {note ? <span className="text-quiet">{note}</span> : null}
    </div>
  );
}

/** Pins on the loose four-column grid, captioned with board and time. */
function PinGrid({ pins, now }: { pins: SavedPin[]; now: number }) {
  return (
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
              alt={p.title ?? `A pin${p.board ? ` on ${p.board}` : ""}`}
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
  );
}

/**
 * My Pinterest, in four parts: who I am there, every public board, pins I've
 * made, and what I've been saving lately (live, like the tracklist).
 * Everything links back to Pinterest.
 */
export function Saved() {
  const saved = useSaved();
  const now = useNow();

  if (!saved) return <div className="min-h-[40vh]" aria-hidden />;

  const { profile, boards, created, pins } = saved;
  const stats = [
    profile.monthlyViews != null ? `${fmt(profile.monthlyViews)} monthly views` : null,
    profile.followers != null ? plural(profile.followers, "follower", "followers") : null,
    profile.following != null ? `${fmt(profile.following)} following` : null,
    profile.pinCount != null ? plural(profile.pinCount, "pin", "pins") : null,
  ].filter(Boolean);

  return (
    <div>
      {/* Profile */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink pt-3 text-[13px] md:grid-cols-4">
        <a href={profile.url} target="_blank" rel="noopener noreferrer" className="col-span-2 flex items-start gap-3 md:col-span-1">
          {profile.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar} alt="" width={48} height={48} className="aspect-square w-12 shrink-0 bg-[#e6e6e6] object-cover" />
          ) : null}
          <span>
            <span className="block leading-tight font-semibold">{profile.name}</span>
            <span className="block text-quiet">@{profile.username}</span>
          </span>
        </a>
        {profile.about ? <p className="col-span-2 max-w-[40ch] md:col-span-1">{profile.about}</p> : <span className="hidden md:block" />}
        <p className="tnum text-quiet">{stats.join(", ")}</p>
        <p className="md:text-right">
          <a href={profile.url} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-4 hover:decoration-2">
            Follow on Pinterest
          </a>
        </p>
      </div>

      {/* Boards */}
      {boards.length > 0 && (
        <>
          <Label note={plural(boards.length, "board", "boards")}>Boards</Label>
          {/* Small on purpose: an index of boards, not a gallery. */}
          <ul className="grid grid-cols-4 gap-x-3 gap-y-5 md:grid-cols-6 lg:grid-cols-8">
            {boards.map((b) => (
              <li key={b.url}>
                <a href={b.url} target="_blank" rel="noopener noreferrer" className="group block">
                  {b.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.cover}
                      alt=""
                      width={236}
                      height={236}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full object-cover"
                      style={{ backgroundColor: b.color ?? "#e6e6e6" }}
                    />
                  ) : (
                    <span aria-hidden className="block aspect-square w-full bg-[#e6e6e6]" />
                  )}
                  <span className="mt-1 block truncate text-[12px] leading-tight font-semibold group-hover:underline">{b.name}</span>
                  <span className="block truncate text-[11px] leading-tight text-quiet">
                    {b.pinCount != null ? plural(b.pinCount, "pin", "pins") : null}
                    {b.updated && now ? (
                      <span className="hidden md:inline">
                        {b.pinCount != null ? ", " : ""}
                        {timeAgo(b.updated, now)}
                      </span>
                    ) : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Created */}
      {created.length > 0 && (
        <>
          <Label note={plural(created.length, "pin", "pins")}>Made by me</Label>
          <PinGrid pins={created} now={now} />
        </>
      )}

      {/* Lately: live */}
      {pins.length > 0 && (
        <>
          <Label note="updates on its own">Lately</Label>
          <PinGrid pins={pins.slice(0, 8)} now={now} />
        </>
      )}
    </div>
  );
}
