"use client";

import Link from "next/link";
import { useListening, useNow, usePresence, useSaved, useTimeline } from "@/lib/presence/client";
import { fmtNum, timeAgo } from "@/lib/time";
import { StatusLine } from "@/components/live/StatusLine";
import { Timeline } from "@/components/home/Timeline";
import { NOW } from "@/content/now";
import { ListeningStats } from "@/components/home/ListeningStats";

const cell = "border-t border-ink pt-1.5";

/**
 * /now: what I'm up to this month. The hand-written lines (if any) come first;
 * the rest writes itself from what I'm actually doing.
 */
export function NowPage() {
  const presence = usePresence();
  const listening = useListening();
  const saved = useSaved();
  const timeline = useTimeline();
  const now = useNow();

  const run = timeline?.events.find((e) => e.kind === "move") ?? null;
  const parts = [
    listening?.onRepeat[0]
      ? {
          k: "On repeat",
          v: `${listening.onRepeat[0].track}, ${listening.onRepeat[0].artist}`,
          d: `${fmtNum(listening.onRepeat[0].plays)} plays this month`,
          href: listening.onRepeat[0].url,
        }
      : null,
    presence?.github
      ? {
          k: "Building",
          v: presence.github.repo,
          d: [presence.github.message, now ? timeAgo(presence.github.at, now) : null].filter(Boolean).join(", "),
          href: presence.github.url,
        }
      : null,
    saved?.hotBoard
      ? { k: "Saving to", v: saved.hotBoard.name, d: `${saved.hotBoard.count} pins lately`, href: saved.hotBoard.url }
      : null,
    run ? { k: "Moving", v: run.title, d: now ? timeAgo(run.at, now) : "", href: run.url ?? undefined } : null,
    presence?.weather ? { k: "In Pune", v: `${presence.weather.tempC}°, ${presence.weather.label}`, d: "right now" } : null,
  ].filter((x): x is { k: string; v: string; d: string; href?: string } => !!x);

  return (
    <div className="space-y-20">
      <StatusLine className={`${cell} pt-3`} />

      {NOW.lines.length > 0 && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <h2 className={`${cell} font-semibold`}>
            In my words
            {NOW.updated ? <span className="block font-normal text-quiet">{NOW.updated}</span> : null}
          </h2>
          <div className={`${cell} space-y-3 text-[17px] leading-snug md:col-span-2`}>
            {NOW.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        </section>
      )}

      {parts.length > 0 && (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {parts.map((p) => (
            <div key={p.k} className={cell}>
              <dt className="text-quiet">{p.k}</dt>
              <dd className="mt-1">
                {p.href ? (
                  <a href={p.href} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
                    {p.v}
                  </a>
                ) : (
                  <span className="font-semibold">{p.v}</span>
                )}
                {p.d ? <span className="block text-quiet">{p.d}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <section>
        <h2 className={`${cell} mb-6 flex justify-between gap-4 font-semibold`}>
          The last 48 hours
          <span className="font-normal text-quiet">music, code, saves and runs, grouped as they happened</span>
        </h2>
        <Timeline />
      </section>

      <ListeningStats />

      <p className={`${cell} flex flex-wrap gap-x-8 gap-y-2`}>
        <Link href="/history" className="hover:underline">
          Search everything →
        </Link>
      </p>
    </div>
  );
}
