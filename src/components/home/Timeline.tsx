"use client";

import { useState } from "react";
import { useNow, useTimeline } from "@/lib/presence/client";
import { Preview } from "@/components/live/Preview";
import { puneClock, puneDayLabel } from "@/lib/time";
import type { TodayEvent } from "@/lib/presence/types";

const KIND: Record<TodayEvent["kind"], string> = { music: "music", code: "code", pin: "saved", move: "moved", sleep: "sleep", desk: "laptop", call: "call", chat: "chat", watch: "watching" };

/**
 * The last seven days across everything, like a diary that writes itself:
 * listening sessions, pushes, saves, runs. Grouped under Today / Yesterday.
 * The rest of the last thirty days opens with one button.
 */
export function Timeline({ limit = 40 }: { limit?: number }) {
  const t = useTimeline();
  const now = useNow();
  const [more, setMore] = useState(false);
  const [openSongs, setOpenSongs] = useState<string | null>(null);
  // Room for it while it loads (measured: ~1000px on phones, ~900px wider), so nothing below jumps.
  if (!t || !now) return <div className="min-h-[62rem] md:min-h-[56rem]" aria-hidden />;
  if (!t.events.length) return <p className="border-t border-ink pt-1.5 text-quiet">Quiet couple of days. Nothing to show yet.</p>;

  const weekAgo = now - 7 * 86_400_000;
  const within = more ? t.events : t.events.filter((e) => Date.parse(e.until ?? e.at) >= weekAgo);
  const earlier = t.events.length - t.events.filter((e) => Date.parse(e.until ?? e.at) >= weekAgo).length;
  const groups: { day: string; items: TodayEvent[] }[] = [];
  for (const e of within.slice(0, more ? 1500 : limit)) {
    const day = puneDayLabel(e.until ?? e.at, now);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <div>
      {groups.map((g) => (
        <section key={g.day} className="mb-8 last:mb-0">
          <h3 className="mb-1 font-semibold">{g.day}</h3>
          <ol>
            {g.items.map((e, i) => {
              const many = !!e.songs && e.songs.length > 1;
              const open = many && openSongs === e.at;
              // A row that is also a link (a work session on its repo) opens its songs from the chevron and the detail line.
              const linked = many && !!e.url;
              const chevron = (
                <svg aria-hidden viewBox="0 0 12 12" className={`size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 4.5 6 8.5 10 4.5" />
                </svg>
              );
              const body = (
                <>
                  <span className="tnum leading-tight text-quiet">
                    {puneClock(e.at)}
                    {e.until ? (
                      <>
                        <span className="hidden md:inline">–{puneClock(e.until)}</span>
                        <span className="block text-[12px] md:hidden">to {puneClock(e.until)}</span>
                      </>
                    ) : null}
                    <span className="block text-[10px] tracking-wide uppercase md:hidden">{KIND[e.kind]}</span>
                  </span>
                  <span className="hidden text-[12px] tracking-wide text-quiet uppercase md:block">{KIND[e.kind]}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      {many ? (
                        linked ? (
                          chevron
                        ) : (
                          chevron
                        )
                      ) : null}
                      {linked ? (
                        <a href={e.url!} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} className="block truncate hover:underline">
                          {e.title}
                        </a>
                      ) : (
                        <span className="block truncate">{e.title}</span>
                      )}
                    </span>
                    {e.detail ? (
                      linked ? (
                        <span className="block truncate text-quiet">{e.detail}</span>
                      ) : (
                        <span className="block truncate text-quiet">{e.detail}</span>
                      )
                    ) : null}
                  </span>
                  {e.preview ? (
                    <Preview id={`tl-${e.at}`} url={e.preview} image={e.image ?? null} label={e.title} size={40} />
                  ) : e.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.image} alt="" width={40} height={40} loading="lazy" className="aspect-square w-10 bg-[#e6e6e6] object-cover" />
                  ) : (
                    <span />
                  )}
                </>
              );
              const cls = "grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-x-3 border-t border-ink/20 py-2 md:grid-cols-[6.5rem_4rem_1fr_2.5rem]";
              return (
                <li key={`${e.kind}${e.at}${i}`}>
                  {linked ? (
                    // The whole row opens the songs; only the project name is a link out.
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => setOpenSongs(open ? null : e.at)}
                      onKeyDown={(ev) => {
                        if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) {
                          ev.preventDefault();
                          setOpenSongs(open ? null : e.at);
                        }
                      }}
                      className={`${cls} cursor-pointer hover:bg-ink/[0.03]`}
                    >
                      {body}
                    </div>
                  ) : many ? (
                    <button type="button" aria-expanded={open} onClick={() => setOpenSongs(open ? null : e.at)} className={`${cls} w-full cursor-pointer text-left hover:bg-ink/[0.03]`}>
                      {body}
                    </button>
                  ) : e.url ? (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-ink/[0.03]`}>
                      {body}
                    </a>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                  {open && e.songs ? (
                    <ul className="pb-2 md:pl-[12rem]">
                      {e.songs.map((song, j) => (
                        <li key={j} className="flex items-center gap-3 py-1">
                          <Preview id={`tl-${e.at}-${j}`} url={song.preview} image={song.image} label={`${song.track} by ${song.artist}`} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate">{song.track}</span>
                            <span className="block truncate text-[13px] text-quiet">{song.artist}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {!more && earlier > 0 ? (
        <button type="button" onClick={() => setMore(true)} className="mt-6 cursor-pointer border-t border-ink pt-1.5 text-left font-semibold underline decoration-1 underline-offset-4">
          Show the earlier days, up to 30
        </button>
      ) : null}
    </div>
  );
}
