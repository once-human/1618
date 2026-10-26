"use client";

import { useEffect, useMemo, useState } from "react";
import { act, type AdminState } from "./store";
import { go } from "./AdminApp";
import { Confirm, Empty, Icon, Panel, Seg, Spinner, Stat, ago, flag, fmt, input, town, when } from "./ui";
import type { EventRow, VisitRow } from "@/lib/visits/shared";
import type { VisitSummary } from "@/lib/visits/server";

type Kind = "person" | "bot" | "all";
type Range = "24" | "168" | "720";

/** How long something took: "40 s", "3 min", "1 h 5 min". */
const dur = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });
const nth = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

/** /admin → privacy: who came, what they did, what's kept, and who can get in. */
export function PrivacyView({ data, open }: { data: AdminState; open: string | null }) {
  const [range, setRange] = useState<Range>("24");
  const [kind, setKind] = useState<Kind>("person");
  const [query, setQuery] = useState("");
  const [log, setLog] = useState<{ key: string; visits: VisitRow[]; summary: VisitSummary } | null>(null);
  const [failed, setFailed] = useState(false);
  const key = `${range}|${kind}`;

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/admin/visitors?hours=${range}&kind=${kind}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { visits: VisitRow[]; summary: VisitSummary }) => live && (setLog({ key, ...d }), setFailed(false)))
        .catch(() => live && setFailed(true));
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [range, kind, key]);

  const loading = !log || log.key !== key;
  const visits = useMemo(() => {
    const all = log?.visits ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((v) =>
      [v.city, v.country, town(v.city, v.country), v.device, v.referrer, v.reason, ...v.trail].some((x) => x?.toLowerCase().includes(q)),
    );
  }, [log, query]);
  const s = log?.summary;

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-14 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-14">
        <section aria-label="The last 24 hours" className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          <Stat value={s ? fmt(s.day.people) : "–"} label="people, last 24 h" />
          <Stat value={s ? fmt(s.day.peopleVisits) : "–"} label="visits" />
          <Stat value={s ? fmt(s.day.pages) : "–"} label="pages they read" />
          <Stat value={s ? fmt(s.day.countries) : "–"} label={s?.day.countries === 1 ? "country" : "countries"} />
          <Stat value={s ? fmt(s.day.bots) : "–"} label="programs" sub={s ? `${fmt(s.day.botPages)} pages fetched` : undefined} />
        </section>

        <Panel title="Visitor log" aside="India time (IST)">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Seg label="Who" value={kind} onChange={setKind} options={[{ id: "person", label: "People" }, { id: "bot", label: "Programs" }, { id: "all", label: "Everyone" }]} />
              <Seg label="When" value={range} onChange={setRange} options={[{ id: "24", label: "24 hours" }, { id: "168", label: "7 days" }, { id: "720", label: "30 days" }]} />
            </div>
            <label className="relative block w-full lg:w-72">
              <span className="sr-only">Search the log</span>
              <Icon name="search" className="text-a-quiet absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Town, page, device, site…" className={`${input} pl-9 text-[15px]`} />
            </label>
          </div>

          {failed && !log ? (
            <Empty>Couldn&apos;t load the log. It refreshes on its own every 30 seconds.</Empty>
          ) : loading ? (
            <p className="text-a-quiet flex items-center gap-2 py-5 text-[14px]">
              <Spinner /> Loading
            </p>
          ) : !visits.length ? (
            <Empty>
              {query ? "Nothing matches that." : kind === "bot" ? "No programs in this stretch." : "Nobody in this stretch yet. The log started when this was switched on."}
            </Empty>
          ) : (
            <>
              <p className="text-a-quiet mb-2 text-[13px]">
                {visits.length} {visits.length === 1 ? "visit" : "visits"}
                {log!.visits.length >= 400 ? " (the latest 400)" : ""}. Press one to see everything it did.
              </p>
              <ol className="border-a-line border-b">
                {visits.map((v) => (
                  <Visit key={v.id} v={v} open={open === v.id} onToggle={() => go(open === v.id ? "privacy" : `privacy/${v.id}`)} />
                ))}
              </ol>
            </>
          )}
        </Panel>

        <div className="grid grid-cols-1 gap-x-10 gap-y-14 md:grid-cols-2">
          <Panel title="Pages people read" aside="Last 30 days">
            <Bars rows={(s?.pages ?? []).map((p) => ({ k: p.path, n: p.views }))} empty="No pages yet." />
          </Panel>
          <Panel title="Where they came from" aside="Last 30 days">
            <Bars rows={(s?.referrers ?? []).map((r) => ({ k: r.referrer === "direct" ? "typed it in, or a link with no source" : r.referrer, n: r.visits }))} empty="Nothing yet." />
          </Panel>
          <Panel title="Devices" aside="Last 30 days">
            <Bars rows={(s?.devices ?? []).map((d) => ({ k: d.device, n: d.visits }))} empty="Nothing yet." />
          </Panel>
          <Panel title="Programs" aside="Pages fetched, last 30 days">
            <Bars rows={(s?.bots ?? []).map((b) => ({ k: b.name, n: b.pages, note: `${b.days} ${b.days === 1 ? "day" : "days"}` }))} empty="No crawlers or previews yet." />
          </Panel>
        </div>
      </div>

      <aside className="min-w-0 space-y-14">
        <Panel title="All time" aside={s?.allTime.since ? `since ${new Date(s.allTime.since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : undefined}>
          <div className="mb-6 grid grid-cols-2 gap-4">
            <Stat value={s ? fmt(s.allTime.visitors) : "–"} label="people" />
            <Stat value={s ? fmt(s.allTime.visits) : "–"} label="visits" />
          </div>
          <Daily rows={s?.daily ?? []} today={data.visitors.day} />
          {data.visitors.unverified ? (
            <p className="text-a-quiet mt-3 text-[13px]">
              Not counted: {fmt(data.visitors.unverified)} early visits from before bot protection existed. Some may have been bots, so they aren&apos;t on the map or in the totals.
            </p>
          ) : null}
          <h3 className="mt-6 mb-1 text-[13px] font-semibold">By country</h3>
          {s?.countries.length ? (
            <ul className="text-[14px]">
              {s.countries.map((c) => (
                <li key={c.country} className="border-a-line flex justify-between gap-3 border-t py-1.5">
                  <span className="truncate">
                    {flag(c.country)} {c.country ? town(null, c.country) : "Unknown"}
                  </span>
                  <span className="text-a-quiet shrink-0 tabular-nums">
                    {fmt(c.visitors)} <span className="text-[12px]">· {fmt(c.visits)} visits</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No countries yet.</Empty>
          )}
        </Panel>

        <Security data={data} />
      </aside>
    </div>
  );
}

/* ---- one visit ---- */

function Visit({ v, open, onToggle }: { v: VisitRow; open: boolean; onToggle: () => void }) {
  const person = v.kind === "person";
  const from = v.referrer ?? "direct";
  return (
    <li className="border-a-line border-t">
      <button type="button" onClick={onToggle} aria-expanded={open} className="hover:bg-a-soft grid w-full grid-cols-[4.2rem_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2.5 text-left md:grid-cols-[4.2rem_minmax(0,14rem)_minmax(0,1fr)_auto]">
        <span className="text-a-quiet text-[13px] tabular-nums">{when(v.lastAt).split(", ").at(-1)}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {flag(v.country)} {person ? town(v.city, v.country) : v.device}
          </span>
          <span className="text-a-quiet block truncate text-[13px]">
            {person ? [v.device, v.screen].filter(Boolean).join(" · ") : `${town(v.city, v.country)} · ${v.reason ?? "a program"}`}
          </span>
        </span>
        <span className="text-a-quiet col-span-2 col-start-2 min-w-0 truncate text-[13px] md:col-span-1 md:col-start-3 md:row-start-1 md:text-[14px]">
          <span className="text-a-ink">{v.trail.length ? v.trail.join(" → ") : "—"}</span>
          <span className="block truncate text-[13px]">
            {person ? `from ${from}` : ""}
            {person && v.nth && v.nth > 1 ? ` · ${nth(v.nth)} visit` : person ? " · first visit" : ""}
            {!person && v.visitor && v.reason ? v.reason : ""}
          </span>
        </span>
        <span className="text-a-quiet col-start-3 row-start-1 text-right text-[13px] tabular-nums md:col-start-4">
          {v.pages} {v.pages === 1 ? "page" : "pages"}
          {person && v.activeMs ? <span className="block">{dur(v.activeMs)}</span> : null}
        </span>
      </button>
      {open ? <Trail v={v} /> : null}
    </li>
  );
}

function Trail({ v }: { v: VisitRow }) {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/visitors?visit=${encodeURIComponent(v.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { events: EventRow[] }) => live && setEvents(d.events))
      .catch(() => live && setEvents([]));
    return () => {
      live = false;
    };
  }, [v.id, v.lastAt]);

  return (
    <div className="border-a-ink mb-3 ml-[4.2rem] border-l-2 pb-1 pl-4 md:ml-[5rem]">
      <dl className="text-a-quiet grid grid-cols-2 gap-x-6 gap-y-1 py-2 text-[13px] sm:grid-cols-4">
        <div>
          <dt>Started</dt>
          <dd className="text-a-ink">{when(v.startedAt)}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd className="text-a-ink">{ago(v.lastAt)}</dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd className="text-a-ink">{v.lang ?? "—"}</dd>
        </div>
        <div>
          <dt>{v.kind === "person" ? "Came from" : "Why it's a program"}</dt>
          <dd className="text-a-ink">{v.kind === "person" ? (v.referrer ?? "direct") : (v.reason ?? "—")}</dd>
        </div>
      </dl>
      {!events ? (
        <p className="text-a-quiet py-2 text-[13px]">
          <Spinner />
        </p>
      ) : !events.length ? (
        <p className="text-a-quiet py-2 text-[13px]">Nothing recorded.</p>
      ) : (
        <ol className="text-[14px]">
          {events.map((e) => (
            <li key={e.seq} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-3 py-1">
              <span className="text-a-quiet text-[12.5px] tabular-nums">{clock(e.at)}</span>
              <span className="min-w-0 truncate">
                {e.type === "page" ? (
                  <>
                    <span className="text-a-quiet">opened </span>
                    <a href={e.path} target="_blank" rel="noopener" className="font-medium hover:underline">
                      {e.path}
                    </a>
                    {e.detail ? <span className="text-a-quiet"> ({e.detail})</span> : null}
                  </>
                ) : e.type === "click" ? (
                  <>
                    <span className="text-a-quiet">left for </span>
                    {e.detail}
                  </>
                ) : (
                  <span>{e.detail}</span>
                )}
              </span>
              <span className="text-a-quiet text-[12.5px] tabular-nums">
                {e.type === "page" && e.ms ? `${dur(e.ms)}${e.scroll != null ? ` · ${e.scroll}% down` : ""}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---- small charts ---- */

function Bars({ rows, empty }: { rows: { k: string; n: number; note?: string }[]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...rows.map((r) => r.n));
  return (
    <ul className="space-y-1.5 text-[14px]">
      {rows.map((r) => (
        <li key={r.k}>
          <div className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{r.k}</span>
            <span className="text-a-quiet shrink-0 tabular-nums">
              {fmt(r.n)}
              {r.note ? <span className="text-[12px]"> · {r.note}</span> : null}
            </span>
          </div>
          <div className="bg-a-line mt-1 h-[2px]">
            <div className="bg-a-ink h-full" style={{ width: `${Math.max(2, (r.n / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** People a day (ink), with programs as a faint bar behind, the last 60 days. */
function Daily({ rows, today }: { rows: VisitSummary["daily"]; today: string }) {
  const days = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - (59 - i) * 86400_000).toISOString().slice(0, 10);
    const r = rows.find((x) => x.day === d);
    return { day: d, people: r?.people ?? 0, bots: r?.bots ?? 0 };
  });
  const max = Math.max(1, ...days.map((d) => Math.max(d.people, d.bots)));
  return (
    <figure>
      <div className="flex h-20 items-end gap-[2px]" role="img" aria-label="People per day, the last 60 days">
        {days.map((d) => (
          <div key={d.day} className="relative flex h-full flex-1 items-end" title={`${d.day}: ${d.people} people, ${d.bots} programs`}>
            <div className="bg-a-line absolute inset-x-0 bottom-0" style={{ height: `${(d.bots / max) * 100}%` }} />
            <div className={`relative w-full ${d.day === today ? "bg-a-signal" : "bg-a-ink"}`} style={{ height: d.people ? `${Math.max(4, (d.people / max) * 100)}%` : 0 }} />
          </div>
        ))}
      </div>
      <figcaption className="text-a-quiet mt-1.5 flex justify-between text-[12px]">
        <span>60 days ago</span>
        <span>people · programs faint</span>
        <span>today</span>
      </figcaption>
    </figure>
  );
}

/* ---- who can get in ---- */

function Security({ data }: { data: AdminState }) {
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Security" aside="Logins to this page">
      <ul className="mb-4 text-[14px]">
        {data.logins.length ? (
          data.logins.slice(0, 8).map((l) => (
            <li key={l.at} className="border-a-line flex justify-between gap-3 border-t py-1.5">
              <span className="min-w-0 truncate">
                {l.device} · {flag(l.country)} {town(l.city, l.country)}
              </span>
              <span className="text-a-quiet shrink-0">{when(l.at)}</span>
            </li>
          ))
        ) : (
          <li className="text-a-quiet">None recorded yet.</li>
        )}
      </ul>
      <Confirm label="Log out everywhere else" yes="Log them all out" busy={busy} onYes={async () => (setBusy(true), await act("logoutAll", {}, "Every other browser is logged out"), setBusy(false))} />
      <p className="text-a-quiet mt-4 text-[13px] leading-snug">
        The key lives in Vercel (ADMIN_SECRET). Changing it logs out every browser; the phone shortcuts need it again, and Telegram needs a reconnect on the site tab. Five wrong tries locks a network out for 15 minutes.
      </p>
    </Panel>
  );
}
