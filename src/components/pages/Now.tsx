"use client";

import { PlayDot } from "@/components/live/PlayDot";
import Link from "next/link";
import { useListening, useNow, usePresence, useSaved, useTimeline } from "@/lib/presence/client";
import { fmtNum, timeAgo } from "@/lib/time";
import { StatusLine } from "@/components/live/StatusLine";
import { DeskDays } from "@/components/home/DeskDays";
import { Timeline } from "@/components/home/Timeline";
import { NOW } from "@/content/now";
import { ListeningStats } from "@/components/home/ListeningStats";
import { VisitorsMap } from "./VisitorsMap";
import { Sky } from "./Sky";

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
          preview: listening.onRepeat[0].preview ?? null,
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
    presence?.health?.steps
      ? {
          k: "Moving today",
          v: `${fmtNum(presence.health.steps)} steps${presence.health.distanceKm ? `, ${presence.health.distanceKm.toFixed(1)} km` : ""}`,
          d: [presence.health.activeKcal ? `${fmtNum(presence.health.activeKcal)} kcal active` : null, now ? `from Apple Health, ${timeAgo(presence.health.at, now)}` : "from Apple Health"]
            .filter(Boolean)
            .join(", "),
        }
      : null,
    presence?.weather ? { k: `In ${presence.place?.city ?? "Pune"}`, v: `${presence.weather.tempC}°, ${presence.weather.label}`, d: "right now" } : null,
  ].filter((x): x is { k: string; v: string; d: string; href?: string; preview?: string | null } => !!x);

  return (
    <div className="space-y-20">
      <div>
        <Sky />
        <StatusLine className={`${cell} pt-3`} />
      </div>

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

      {/* Room for the grid below while it loads: one column on phones, six on wide screens. */}
      {!presence ? <div className="min-h-[26rem] sm:min-h-[15rem] lg:min-h-[10rem] xl:min-h-[6rem]" aria-hidden /> : null}
      {parts.length > 0 && (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                {p.preview ? <PlayDot id={`repeat-${p.v}`} url={p.preview} label={p.v} className="ml-2" /> : null}
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

      <DeskDays />

      <ListeningStats />

      <VisitorsMap />

      <p className={`${cell} flex flex-wrap gap-x-8 gap-y-2`}>
        <Link href="/history" className="hover:underline">
          Search everything →
        </Link>
      </p>
    </div>
  );
}
