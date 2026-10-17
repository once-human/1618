"use client";

import { useState } from "react";
import { LAND_PATH, MAP, project } from "@/components/pages/VisitorsMap";
import { act, isNew, type AdminState, type Person, type Thread } from "./store";
import { Button, Dot, Empty, Panel, ago, flag, fmt, input, town, until } from "./ui";
import { go } from "./AdminApp";

const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

export function NowView({ data, people }: { data: AdminState; people: Person[] | null }) {
  const waiting = data.talk.threads.filter(isNew);
  const broken = data.sources.checks.filter((c) => c.ok === false);
  const today = data.health.find((h) => h.day === data.visitors.day);
  const here = people?.length ?? null;

  return (
    <div className="space-y-4">
      {/* The moment, in one sentence. */}
      <p className="wide max-w-[34ch] text-[24px] leading-[1.18] font-semibold tracking-tight md:text-[34px]">
        {here === null ? "Checking who's on the site…" : here === 0 ? "Nobody's on the site right now." : `${plural(here, "person is", "people are")} on the site right now.`}{" "}
        {waiting.length ? (
          <a href="#talk" className="text-a-signal underline decoration-2 underline-offset-4">
            {plural(waiting.length, "chat is", "chats are")} waiting on you.
          </a>
        ) : (
          <span className="text-a-quiet">Nobody&apos;s waiting on you.</span>
        )}{" "}
        <span className="text-a-quiet">
          {plural(data.visitors.people, "visitor")} today
          {data.visitors.places.length ? ` from ${plural(data.visitors.places.filter((p) => p.city).length, "place")}` : ""}.
        </span>
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          {waiting.length ? (
            <Panel title="Waiting on you" aside={<a href="#talk" className="hover:text-a-ink">All chats</a>}>
              <ul className="divide-a-line divide-y">
                {waiting.slice(0, 3).map((t) => (
                  <QuickReply key={t.id} t={t} />
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="On the site right now" aside={here ? "Live. You're not counted." : null}>
            {people === null ? (
              <Empty>Connecting…</Empty>
            ) : people.length ? (
              <ul className="divide-a-line divide-y">
                {people.map((p) => (
                  <li key={p.key} className="flex items-center gap-3 py-2.5">
                    <Dot tone="live" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">
                        {flag(p.country)} {town(p.city, p.country)}
                      </span>
                      <span className="text-a-quiet block truncate text-[13px]">
                        {p.pages.length ? p.pages.map((x) => (x === "/" ? "home" : x)).join(", ") : "page not known yet"}
                        {p.tabs > 1 ? `, ${p.tabs} tabs` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nobody right now. Share a link and watch this fill up.</Empty>
            )}
          </Panel>

          <Panel title="Today's visitors" aside={`${fmt(data.visitors.total)} all time`}>
            <TodayMap places={data.visitors.places} />
            {data.visitors.places.length ? (
              <ul className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {data.visitors.places.map((p) => (
                  <li key={`${p.city}${p.country}`} className="border-a-line flex justify-between gap-3 border-t py-1.5 text-[14px]">
                    <span className="truncate">
                      {flag(p.country)} {p.city ? town(p.city, p.country) : "Town not known"}
                    </span>
                    <span className="text-a-quiet tabular-nums">{p.n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No visitors yet today (Pune time).</Empty>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="How the site shows you" aside={<a href="#you" className="hover:text-a-ink">Change</a>}>
            <dl className="space-y-3 text-[14.5px]">
              <Row k="Status">
                {data.status ? (
                  <>
                    “{data.status.text}” <span className="text-a-quiet">for {until(data.status.until)} more</span>
                  </>
                ) : (
                  <span className="text-a-quiet">None. The site works it out from what you&apos;re doing.</span>
                )}
              </Row>
              <Row k="Place">
                {data.place.city}
                <span className="text-a-quiet">
                  {data.weather ? `, ${data.weather.tempC}° ${data.weather.label.toLowerCase()}` : ""}
                  {data.place.held ? ", held" : data.place.setAt ? `, set ${ago(data.place.setAt)}` : ", the default"}
                </span>
              </Row>
              <Row k="Music">
                {data.music?.[0] ? (
                  <>
                    {data.music[0].nowPlaying ? "Playing " : ""}
                    {data.music[0].track} <span className="text-a-quiet">by {data.music[0].artist}{data.music[0].nowPlaying ? "" : `, ${ago(data.music[0].at)}`}</span>
                  </>
                ) : (
                  <span className="text-a-quiet">Nothing from Last.fm</span>
                )}
              </Row>
              <Row k="Code">
                {data.github ? (
                  <>
                    {data.github.repo} <span className="text-a-quiet">{ago(data.github.at)}</span>
                  </>
                ) : (
                  <span className="text-a-quiet">No public pushes lately</span>
                )}
              </Row>
              <Row k="Steps">
                {today?.steps ? (
                  <>
                    {fmt(today.steps)} <span className="text-a-quiet">{today.distanceKm ? `${fmt(today.distanceKm, 1)} km, ` : ""}sent {ago(today.at)}</span>
                  </>
                ) : (
                  <span className="text-a-quiet">Nothing from your phone today</span>
                )}
              </Row>
            </dl>
          </Panel>

          <Panel title="Needs attention">
            {broken.length ? (
              <ul className="space-y-2 text-[14.5px]">
                {broken.map((c) => (
                  <li key={c.name} className="flex gap-2">
                    <span className="mt-1.5">
                      <Dot tone="bad" />
                    </span>
                    <span>
                      <b className="font-medium">{c.name}</b> isn&apos;t answering <span className="text-a-quiet">({c.detail})</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-[14.5px]">
                <Dot tone="ok" /> Every source is answering.
              </p>
            )}
            <p className="text-a-quiet mt-3 text-[13px]">
              {fmt(data.store?.plays_today)} plays today, {fmt(data.posts.filter((p) => Date.parse(data.at) - Date.parse(p.at) < 86400_000).length)} posts in the last day.{" "}
              <a href="#site" className="hover:text-a-ink underline">
                Details
              </a>
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-3">
      <dt className="text-a-quiet">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function QuickReply({ t }: { t: Thread }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const r = await act("reply", { thread: t.id, text }, "Reply sent");
    setBusy(false);
    if (r) setText("");
  }
  return (
    <li className="py-3">
      <button type="button" onClick={() => go(`talk/${t.id}`)} className="block w-full text-left">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-medium">
            {t.name || "No name"} <span className="text-a-quiet font-normal">{flag(t.country)} {t.city ?? ""}</span>
          </span>
          <span className="text-a-quiet shrink-0 text-[12.5px]">{ago(t.last?.at)}</span>
        </span>
        <span className="mt-0.5 line-clamp-2 text-[14.5px]">{t.last?.text}</span>
      </button>
      <form onSubmit={send} className="mt-2 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply" className={`${input} py-2`} aria-label={`Reply to ${t.name || "them"}`} />
        <Button type="submit" kind="signal" busy={busy} disabled={!text.trim()}>
          Send
        </Button>
        <Button kind="quiet" busy={reading} onClick={async () => (setReading(true), await act("read", { thread: t.id }, "Marked as read"), setReading(false))}>
          Mark as read
        </Button>
      </form>
    </li>
  );
}

function TodayMap({ places }: { places: AdminState["visitors"]["places"] }) {
  const placed = places.filter((p) => p.lat != null && p.lon != null);
  const max = Math.max(1, ...placed.map((p) => p.n));
  return (
    <svg viewBox={`0 ${MAP.rows * 0.04} ${MAP.cols} ${MAP.rows * 0.86}`} className="w-full" role="img" aria-label="Where today's visitors came from">
      <path d={LAND_PATH} stroke="currentColor" strokeWidth={0.42} strokeLinecap="round" className="text-a-line" />
      {placed.map((p) => {
        const { x, y } = project(p.lat!, p.lon!);
        return <circle key={`${p.city}${p.country}`} cx={x} cy={y} r={0.9 + (p.n / max) * 1.6} className="fill-a-ink" opacity={0.8} />;
      })}
    </svg>
  );
}
