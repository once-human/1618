"use client";

import { useNow, useTimeline } from "@/lib/presence/client";
import { puneClock, puneDayLabel } from "@/lib/time";
import type { TodayEvent } from "@/lib/presence/types";

const KIND: Record<TodayEvent["kind"], string> = { music: "music", code: "code", pin: "saved", move: "moved" };

/**
 * The last 48 hours across everything, like a diary that writes itself:
 * listening sessions, pushes, saves, runs. Grouped under Today / Yesterday.
 */
export function Timeline({ limit = 40 }: { limit?: number }) {
  const t = useTimeline();
  const now = useNow();
  if (!t || !now) return <div className="min-h-[30vh]" aria-hidden />;
  if (!t.events.length) return <p className="border-t border-ink pt-1.5 text-quiet">Quiet couple of days. Nothing to show yet.</p>;

  const groups: { day: string; items: TodayEvent[] }[] = [];
  for (const e of t.events.slice(0, limit)) {
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
                    <span className="block truncate">{e.title}</span>
                    {e.detail ? <span className="block truncate text-quiet">{e.detail}</span> : null}
                  </span>
                  {e.image ? (
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
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-ink/[0.03]`}>
                      {body}
                    </a>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
