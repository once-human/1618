"use client";

import { useEffect, useRef, useState } from "react";
import { useNow, useSaved } from "@/lib/presence/client";
import { fmtNum, timeAgo } from "@/lib/time";
import { Label } from "@/components/site/Label";
import type { PinterestBoard, SavedPin } from "@/lib/presence/types";

/** Loose contact-sheet rhythm: each column sits at a slightly different height. */
const DROP = ["0rem", "5rem", "1.5rem", "8rem"];

const plural = (n: number, one: string, many: string) => `${fmtNum(n)} ${n === 1 ? one : many}`;

/** Hue of a #rrggbb colour (0-360), greys last. */
function hue(hex: string | null): number {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return 999;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.08) return 400 + (1 - max) * 100; // greys, light to dark, after the colours
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * My Pinterest: who I am there, every public board (as a four-pin mosaic; hover
 * to peek at three), the colours I've been saving, and what I've saved lately.
 * Lately is live: new saves slide in while you're here. Pins open here first,
 * with a way through to Pinterest.
 */
export function Saved() {
  const saved = useSaved();
  const now = useNow();
  const [order, setOrder] = useState<"time" | "colour">("time");
  const [open, setOpen] = useState<number | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Live arrival: anything not seen since the page opened is "just in".
  useEffect(() => {
    if (!saved) return;
    const ids = saved.pins.map((p) => p.id);
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    added.forEach((id) => seen.current!.add(id));
    if (added.length) {
      setFresh(new Set(added));
      const t = setTimeout(() => setFresh(new Set()), 20_000);
      return () => clearTimeout(t);
    }
  }, [saved]);

  if (!saved) return <div className="min-h-[40vh]" aria-hidden />;

  const { profile, boards, created, pins, palette, hotBoard } = saved;
  const stats = [
    profile.monthlyViews != null ? `${fmtNum(profile.monthlyViews)} monthly views` : null,
    profile.followers != null ? plural(profile.followers, "follower", "followers") : null,
    profile.following != null ? `${fmtNum(profile.following)} following` : null,
    profile.pinCount != null ? plural(profile.pinCount, "pin", "pins") : null,
  ].filter(Boolean);

  const lately = pins.slice(0, 8);
  const shown = order === "colour" ? [...lately].sort((a, b) => hue(a.color) - hue(b.color)) : lately;

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

      {/* The colours of what I've been saving */}
      {palette.length > 2 && (
        <div className="mt-10">
          <div className="flex h-10 overflow-hidden outline outline-1 -outline-offset-1 outline-ink/10" role="img" aria-label={`The colours of my last ${palette.length} saves`}>
            {palette.map((c, i) => (
              <span key={i} className="block h-full flex-1" style={{ backgroundColor: c }} title={c} />
            ))}
          </div>
          <p className="mt-1.5 flex justify-between gap-4 text-[12px] text-quiet">
            <span>The colours of my last {palette.length} saves</span>
            {hotBoard ? (
              <span>
                Saving to{" "}
                <a href={hotBoard.url} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">
                  {hotBoard.name}
                </a>{" "}
                most lately ({hotBoard.count})
              </span>
            ) : null}
          </p>
        </div>
      )}

      {/* Boards */}
      {boards.length > 0 && (
        <>
          <Label
            note={
              profile.boardCount && profile.boardCount > boards.length
                ? `${boards.length} of ${profile.boardCount} boards`
                : plural(boards.length, "board", "boards")
            }
          >
            Boards
          </Label>
          {/* Small on purpose: an index of boards, not a gallery. */}
          <ul className="grid grid-cols-4 gap-x-3 gap-y-5 md:grid-cols-6 lg:grid-cols-8">
            {boards.map((b) => (
              <Board key={b.url} b={b} now={now} />
            ))}
          </ul>
        </>
      )}

      {/* Created */}
      {created.length > 0 && (
        <>
          <Label note={plural(created.length, "pin", "pins")}>Made by me</Label>
          <PinGrid pins={created} now={now} onOpen={() => {}} fresh={new Set()} />
        </>
      )}

      {/* Lately: live */}
      {lately.length > 0 && (
        <>
          <Label
            note={
              <span className="inline-flex gap-3">
                <span className="hidden sm:inline">updates on its own</span>
                <span role="group" aria-label="Order">
                  {(["time", "colour"] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOrder(o)}
                      aria-pressed={order === o}
                      className={`ml-2 ${order === o ? "text-ink underline underline-offset-4" : "hover:text-ink"}`}
                    >
                      by {o}
                    </button>
                  ))}
                </span>
              </span>
            }
          >
            Lately
          </Label>
          <PinGrid pins={shown} now={now} fresh={fresh} onOpen={(i) => setOpen(lately.indexOf(shown[i]))} />
        </>
      )}

      {open != null && <PinView pins={lately} index={open} now={now} onClose={() => setOpen(null)} onMove={setOpen} />}
    </div>
  );
}

/** A board as a 2×2 mosaic of its latest pins. Hover (on a mouse) to peek at three, bigger. */
function Board({ b, now }: { b: PinterestBoard; now: number }) {
  const tiles = b.mosaic.length >= 4 ? b.mosaic.slice(0, 4) : null;
  return (
    <li className="group relative">
      <a href={b.url} target="_blank" rel="noopener noreferrer" className="block">
        {tiles ? (
          <span className="grid aspect-square grid-cols-2 gap-px bg-paper" style={{ backgroundColor: b.color ?? "#e6e6e6" }}>
            {tiles.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
            ))}
          </span>
        ) : b.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.cover} alt="" width={236} height={236} loading="lazy" decoding="async" className="aspect-square w-full object-cover" style={{ backgroundColor: b.color ?? "#e6e6e6" }} />
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
      {b.mosaic.length >= 3 && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-[19rem] -translate-x-1/2 translate-y-1 grid-cols-3 gap-1 bg-paper p-1 opacity-0 shadow-[0_8px_30px_rgba(0,0,0,0.18)] transition duration-200 [@media(hover:hover)]:grid group-hover:translate-y-0 group-hover:opacity-100"
        >
          {b.mosaic.slice(0, 3).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" loading="lazy" className="aspect-[3/4] w-full bg-[#e6e6e6] object-cover" />
          ))}
        </span>
      )}
    </li>
  );
}

/** Pins on the loose four-column grid, captioned with board and time. */
function PinGrid({ pins, now, onOpen, fresh }: { pins: SavedPin[]; now: number; onOpen: (i: number) => void; fresh: Set<string> }) {
  return (
    <ul className="grid grid-cols-2 items-start gap-4 md:grid-cols-4">
      {pins.map((p, i) => (
        <li
          key={p.id}
          style={{ "--d": DROP[i % 4] } as React.CSSProperties}
          className={`md:[margin-top:var(--d)] ${fresh.has(p.id) ? "animate-[arrive_0.9s_cubic-bezier(.2,.7,.2,1)_both]" : ""}`}
        >
          <button type="button" onClick={() => onOpen(i)} className="group block w-full text-left" aria-label={`Open ${p.title ?? "this pin"}`}>
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
              {fresh.has(p.id) ? <span className="mr-1 font-semibold text-ink">just in ·</span> : null}
              {[p.board, p.at && now ? timeAgo(p.at, now) : null].filter(Boolean).join(", ")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A pin, opened on the site: big, with its board and time, arrows to move, and a way to Pinterest. */
function PinView({
  pins,
  index,
  now,
  onClose,
  onMove,
}: {
  pins: SavedPin[];
  index: number;
  now: number;
  onClose: () => void;
  onMove: (i: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const p = pins[index];

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onMove((index + 1) % pins.length);
      if (e.key === "ArrowLeft") onMove((index - 1 + pins.length) % pins.length);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, pins.length, onMove]);

  if (!p) return null;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto max-h-[92svh] w-[min(92vw,960px)] bg-paper p-0 text-ink backdrop:bg-ink/70"
      aria-label={p.title ?? "Pin"}
    >
      <div className="grid max-h-[92svh] grid-cols-1 md:grid-cols-[1.4fr_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.image}
          alt={p.title ?? ""}
          className="max-h-[60svh] w-full object-contain md:max-h-[92svh]"
          style={{ backgroundColor: p.color ?? "#e6e6e6" }}
        />
        <div className="flex flex-col justify-between gap-6 p-4 text-[14px]">
          <div>
            <p className="border-t border-ink pt-1.5 text-quiet">
              {p.board ? (
                <>
                  Saved to{" "}
                  <a href={p.boardUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">
                    {p.board}
                  </a>
                </>
              ) : (
                "Saved"
              )}
              {p.at && now ? `, ${timeAgo(p.at, now)}` : ""}
            </p>
            {p.title ? <p className="mt-3 line-clamp-[10] leading-snug">{p.title}</p> : null}
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-ink pt-1.5">
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-1 underline-offset-4 hover:decoration-2">
              Open on Pinterest
            </a>
            <span className="flex gap-4 text-quiet">
              <button type="button" onClick={() => onMove((index - 1 + pins.length) % pins.length)} className="hover:text-ink" aria-label="Previous pin">
                ←
              </button>
              <span className="tnum">
                {index + 1}/{pins.length}
              </span>
              <button type="button" onClick={() => onMove((index + 1) % pins.length)} className="hover:text-ink" aria-label="Next pin">
                →
              </button>
              <button type="button" onClick={() => ref.current?.close()} className="hover:text-ink">
                close
              </button>
            </span>
          </div>
        </div>
      </div>
    </dialog>
  );
}
