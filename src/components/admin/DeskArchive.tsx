"use client";

import { useEffect, useState } from "react";
import { Button, Panel, fmt } from "./ui";
import type { DayRollup, Span } from "@/lib/desk/model";
import type { TodayEvent } from "@/lib/presence/types";
import { puneClock, puneDayLabel } from "@/lib/time";

interface Archive {
  days: { day: string; summary: DayRollup; spans: number; raw: boolean }[];
  samples: { n: number; since: string | null; mb: number };
  archiveMb: number;
  rawDays: number;
}

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
const clock = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(11, 16);
const dayName = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const link = "border-a-line hover:bg-a-bg inline-flex min-h-9 items-center rounded-lg border px-3 text-[14px] font-medium";

/** Everything the laptop agent has ever told the site: totals per day, every span, and downloads. Admin only. */
export function DeskArchive() {
  const [a, setA] = useState<Archive | null>(null);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [spans, setSpans] = useState<Span[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/desk", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setA(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const show = (day: string) => {
    if (open === day) return setOpen(null);
    setOpen(day);
    setSpans(null);
    fetch(`/api/admin/desk?day=${day}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSpans(d?.spans ?? []))
      .catch(() => setSpans([]));
  };

  const days = a ? (all ? a.days : a.days.slice(0, 30)) : [];
  return (
    <Panel title="Laptop record" aside={a ? `${a.days.length} days kept for good` : "loading"}>
      {a ? (
        <>
          <p className="text-[14.5px]">
            Every 30-second sample is held for {a.rawDays} days ({fmt(a.samples.n)} so far{a.samples.since ? `, since ${dayName(new Date(Date.parse(a.samples.since) + 5.5 * 3600_000).toISOString().slice(0, 10))}` : ""}, {a.samples.mb} MB). After that a day keeps its totals and every span, for good ({a.archiveMb} MB for {a.days.length} days). The public site shows the last seven days.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className={link} href="/api/admin/desk/export?kind=spans&format=csv" download>
              All spans, CSV
            </a>
            <a className={link} href="/api/admin/desk/export?kind=spans&format=json" download>
              All spans, JSON
            </a>
            <a className={link} href="/api/admin/desk/export?kind=days&format=csv" download>
              Daily totals, CSV
            </a>
            <a className={link} href="/api/admin/desk/export?kind=samples" download>
              Raw samples (last {a.rawDays} days), JSON
            </a>
          </div>
          <ul className="divide-a-line mt-4 divide-y">
            {days.map((d) => (
              <li key={d.day} className="py-2 text-[14px]">
                <button type="button" onClick={() => show(d.day)} className="grid w-full grid-cols-[8.5rem_1fr_auto] items-baseline gap-x-3 text-left" aria-expanded={open === d.day}>
                  <span className="font-medium">{dayName(d.day)}</span>
                  <span className="text-a-quiet min-w-0 truncate tabular-nums">
                    {hm(d.summary.activeMin)} at the laptop{d.summary.claudeMin ? `, ${hm(d.summary.claudeMin)} with Claude Code` : ""}
                    {d.summary.repos[0] ? `, mostly ${d.summary.repos[0].name}` : ""}
                  </span>
                  <span className="text-a-quiet text-[12.5px] tabular-nums">{d.spans ? `${d.spans} spans` : "totals"}</span>
                </button>
                {open === d.day ? (
                  <ul className="bg-a-bg mt-2 max-h-80 overflow-auto rounded-lg p-2 text-[13px] tabular-nums">
                    {!spans ? <li className="text-a-quiet">Loading…</li> : null}
                    {spans
                      ?.filter((s) => s.lane === "doing" && s.kind !== "idle")
                      .map((s, i) => (
                        <li key={i} className="flex gap-3 py-0.5">
                          <span className="text-a-quiet w-[6.5rem] shrink-0">
                            {clock(s.start)}–{clock(s.end)}
                          </span>
                          <span className="min-w-0 truncate">
                            {s.label}
                            {s.detail ? <span className="text-a-quiet"> · {s.detail}</span> : null}
                          </span>
                        </li>
                      ))}
                    {spans && !spans.length ? <li className="text-a-quiet">Nothing kept for this day.</li> : null}
                  </ul>
                ) : null}
              </li>
            ))}
            {!days.length ? <li className="text-a-quiet py-2 text-[14px]">The first day is filed after midnight.</li> : null}
          </ul>
          {a.days.length > 30 ? (
            <Button className="mt-3" onClick={() => setAll(!all)}>
              {all ? "Show the last 30 days" : `Show all ${a.days.length} days`}
            </Button>
          ) : null}
        </>
      ) : (
        <p className="text-a-quiet text-[14px]">Loading the record…</p>
      )}
    </Panel>
  );
}

/** The timeline over a longer stretch than the public site shows. */
export function LongTimeline() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ hours: number; events: TodayEvent[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(120);

  const load = (n: number) => {
    setDays(n);
    setBusy(true);
    setShown(120);
    fetch(`/api/admin/timeline?days=${n}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setBusy(false));
  };

  const [now] = useState(() => Date.now());
  const groups: { day: string; items: TodayEvent[] }[] = [];
  for (const e of (data?.events ?? []).slice(0, shown)) {
    const day = puneDayLabel(e.until ?? e.at, now);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <Panel title="Timeline, longer" aside={data ? `${data.events.length} entries over ${days} days` : "the public one shows seven days"}>
      <div className="flex flex-wrap gap-2">
        {[7, 30, 90, 365].map((n) => (
          <Button key={n} kind={data && days === n ? "primary" : "plain"} busy={busy && days === n} onClick={() => load(n)}>
            {n === 365 ? "A year" : `${n} days`}
          </Button>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g.day} className="mt-4">
          <h3 className="mb-1 text-[14px] font-semibold">{g.day}</h3>
          <ol className="text-[14px]">
            {g.items.map((e, i) => (
              <li key={i} className="grid grid-cols-[5.5rem_1fr] gap-x-3 py-0.5">
                <span className="text-a-quiet tabular-nums">
                  {puneClock(e.at)}
                  {e.until ? `–${puneClock(e.until)}` : ""}
                </span>
                <span className="min-w-0">
                  {e.title}
                  {e.detail ? <span className="text-a-quiet"> · {e.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {data && data.events.length > shown ? (
        <Button className="mt-4" onClick={() => setShown(shown + 200)}>
          Show more
        </Button>
      ) : null}
    </Panel>
  );
}
