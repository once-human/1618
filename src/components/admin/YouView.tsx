"use client";

import { useEffect, useRef, useState } from "react";
import { typicalBedtime } from "@/lib/presence/asleep";
import { act, type AdminState, type HealthDay, type RecentPlace } from "./store";
import { Button, Chip, Empty, Icon, Panel, Spinner, ago, clockIn, flag, fmt, input, until } from "./ui";

export function YouView({ data }: { data: AdminState }) {
  return (
    // Phones: status, then place, bedtime, health. Wide screens: place gets its own column.
    <div className="grid grid-cols-1 items-start gap-x-10 gap-y-14 lg:grid-cols-2">
      <StatusPanel data={data} />
      <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1">
        <PlacePanel data={data} />
      </div>
      <BedtimePanel data={data} />
      <HealthPanel days={data.health} today={data.visitors.day} installed={data.shortcuts.health} />
    </div>
  );
}

/* ---- status ---- */

const PRESETS = ["Heads-down, building", "In a meeting", "Out for a run", "At the gym", "Travelling", "With friends", "Off for the day", "Asleep"];
const DURATIONS: { label: string; minutes: () => number }[] = [
  { label: "30 min", minutes: () => 30 },
  { label: "1 hour", minutes: () => 60 },
  { label: "2 hours", minutes: () => 120 },
  { label: "4 hours", minutes: () => 240 },
  { label: "Until tonight", minutes: () => minutesUntil(23, 59) },
  { label: "Until tomorrow", minutes: () => minutesUntil(9, 0, true) },
];
/** Minutes until hh:mm Pune time (tomorrow if `next`, or if it's already past). */
function minutesUntil(h: number, m: number, next = false) {
  const nowIst = new Date(Date.now() + 5.5 * 3600_000);
  const target = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate() + (next ? 1 : 0), h, m));
  let diff = (target.getTime() - nowIst.getTime()) / 60000;
  if (diff <= 0) diff += 1440;
  return Math.round(diff);
}

function StatusPanel({ data }: { data: AdminState }) {
  const [text, setText] = useState("");
  const [dur, setDur] = useState(3);
  const [busy, setBusy] = useState<string | null>(null);
  const s = data.status;

  async function set(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy("set");
    const r = await act("status", { text, minutes: DURATIONS[dur].minutes() }, "Status set");
    setBusy(null);
    if (r) setText("");
  }

  return (
    <Panel title="Status" aside="Top of the home page and /now">
      {s ? (
        <div className="border-a-ink mb-5 flex items-start justify-between gap-3 border-l-2 py-1 pl-3.5">
          <div>
            <p className="font-medium">“{s.text}”</p>
            <p className="text-a-quiet text-[13px]">
              Set {ago(s.setAt)}, clears in {until(s.until)}
            </p>
          </div>
          <Button kind="quiet" busy={busy === "clear"} onClick={async () => (setBusy("clear"), await act("clearStatus", {}, "Status cleared"), setBusy(null))}>
            Clear
          </Button>
        </div>
      ) : (
        <p className="text-a-quiet mb-4 text-[14.5px]">None set. The site says what you&apos;re up to from your music and code.</p>
      )}

      <form onSubmit={set} className="space-y-3">
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 80))} placeholder="What are you up to?" className={input} aria-label="Status" />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Chip key={p} on={text === p} onClick={() => setText(p)}>
              {p}
            </Chip>
          ))}
        </div>
        <div>
          <p className="text-a-quiet mb-1.5 text-[13px]">For</p>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d, i) => (
              <Chip key={d.label} on={dur === i} onClick={() => setDur(i)}>
                {d.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-a-quiet min-w-0 truncate text-[13px]">{text.trim() ? `The site will say “${text.trim()}”, ${/^Until/.test(DURATIONS[dur].label) ? DURATIONS[dur].label.toLowerCase() : `for ${DURATIONS[dur].label}`}.` : ""}</p>
          <Button type="submit" kind="primary" busy={busy === "set"} disabled={!text.trim()}>
            Set status
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/* ---- where I am ---- */

interface Found {
  city: string;
  region?: string | null;
  country?: string | null;
  cc?: string | null;
  lat: number;
  lon: number;
  tz: string;
}
const QUICK: Found[] = [
  { city: "Pune", region: "Maharashtra", cc: "IN", lat: 18.52, lon: 73.86, tz: "Asia/Kolkata" },
  { city: "Bengaluru", region: "Karnataka", cc: "IN", lat: 12.97, lon: 77.59, tz: "Asia/Kolkata" },
  { city: "Mumbai", region: "Maharashtra", cc: "IN", lat: 19.07, lon: 72.88, tz: "Asia/Kolkata" },
];

function PlacePanel({ data }: { data: AdminState }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Found | null>(null);
  const [keep, setKeep] = useState(false);
  const [keepFor, setKeepFor] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = data.place;
  const searchRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      searchRef.current?.abort();
      const ctrl = new AbortController();
      searchRef.current = ctrl;
      setSearching(true);
      try {
        const d = (await (await fetch(`/api/admin/places?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })).json()) as { results: Found[]; error?: string };
        setResults(d.results);
        setError(d.error ?? null);
      } catch {
        /* a newer search took over */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function here() {
    setError(null);
    if (!navigator.geolocation) return setError("This browser can't share its location.");
    setBusy("locate");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const d = (await (await fetch(`/api/admin/places?lat=${coords.latitude}&lon=${coords.longitude}`)).json()) as { results: Found[] };
          if (d.results[0]) setPicked(d.results[0]);
          else setError("Couldn't name the town you're in. Search for it instead.");
        } catch {
          setError("The place lookup isn't answering. Search instead.");
        }
        setBusy(null);
      },
      (e) => {
        setBusy(null);
        setError(e.code === 1 ? "Location access is off for this site. Allow it in your browser, or search." : "Couldn't get your location. Search instead.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  async function save() {
    if (!picked) return;
    setBusy("save");
    const r = await act("place", { city: picked.city, lat: picked.lat, lon: picked.lon, tz: picked.tz, country: picked.cc ?? null, hold: keep, holdHours: keepFor }, `You're in ${picked.city} now`);
    setBusy(null);
    if (r) {
      setPicked(null);
      setQ("");
      setResults(null);
    }
  }

  const recent: Found[] = [...p.recent.map((r: RecentPlace) => ({ ...r, cc: r.country })), ...QUICK].filter((x, i, a) => a.findIndex((y) => y.city === x.city && y.tz === x.tz) === i).slice(0, 6);

  return (
    <Panel title="Where you are" aside="For the clock and the weather">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="wide text-[28px] leading-none font-bold tracking-tight">{p.city}</p>
          <p className="text-a-quiet mt-1.5 text-[14px]">
            {clockIn(p.tz)} there{data.weather ? `, ${data.weather.tempC}° and ${data.weather.label.toLowerCase()}` : ""}.{" "}
            {p.setAt ? `Set ${ago(p.setAt)}.` : "The default."}
          </p>
        </div>
        <Icon name="pin" className="text-a-quiet size-6" />
      </div>

      {p.held ? (
        <div className="border-a-signal mb-5 flex items-center justify-between gap-3 border-l-2 py-1 pl-3.5 text-[14px]">
          <span>Held here{p.held.until ? ` for ${until(p.held.until)} more` : " until you let go"}. Your phone&apos;s location shortcut is ignored.</span>
          <Button kind="quiet" busy={busy === "letgo"} onClick={async () => (setBusy("letgo"), await act("letGo", {}, "Your phone can update it again"), setBusy(null))}>
            Let go
          </Button>
        </div>
      ) : null}

      {picked ? (
        <div className="border-a-ink border-l-2 py-1 pl-3.5">
          <p className="font-semibold">
            {flag(picked.cc)} {picked.city}
            <span className="text-a-quiet font-normal">{[picked.region, picked.country].filter(Boolean).length ? `, ${[picked.region, picked.country].filter(Boolean).join(", ")}` : ""}</span>
          </p>
          <p className="text-a-quiet text-[13.5px]">
            {clockIn(picked.tz)} there ({picked.tz.replace(/_/g, " ")})
          </p>
          <label className="mt-3 flex items-start gap-2.5 text-[14.5px]">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="accent-a-signal mt-1 size-4" />
            <span>Hold it here, so my phone&apos;s shortcut doesn&apos;t move it</span>
          </label>
          {keep ? (
            <div className="mt-2 ml-6 flex flex-wrap gap-2">
              {([[null, "Until I let go"], [24, "1 day"], [72, "3 days"], [168, "1 week"]] as [number | null, string][]).map(([h, l]) => (
                <Chip key={l} on={keepFor === h} onClick={() => setKeepFor(h)}>
                  {l}
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button kind="primary" busy={busy === "save"} onClick={save}>
              Set to {picked.city}
            </Button>
            <Button kind="quiet" onClick={() => setPicked(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any town or city" className={`${input} pl-10`} aria-label="Search for a place" autoComplete="off" />
            <span className="text-a-quiet absolute top-1/2 left-3.5 -translate-y-1/2">{searching ? <Spinner /> : <Icon name="search" className="size-4" />}</span>
          </div>
          {results && q.trim().length >= 2 ? (
            results.length ? (
              <ul className="border-a-line divide-a-line mt-2 divide-y border-y">
                {results.map((r) => (
                  <li key={`${r.city}${r.lat}${r.lon}`}>
                    <button type="button" onClick={() => setPicked(r)} className="hover:bg-a-soft flex w-full items-baseline justify-between gap-3 px-1 py-2.5 text-left">
                      <span className="min-w-0 truncate">
                        {flag(r.cc)} <b className="font-medium">{r.city}</b>
                        <span className="text-a-quiet">{[r.region, r.country].filter(Boolean).length ? `, ${[r.region, r.country].filter(Boolean).join(", ")}` : ""}</span>
                      </span>
                      <span className="text-a-quiet shrink-0 text-[13px] tabular-nums">{clockIn(r.tz)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No town called that. Try another spelling?</Empty>
            )
          ) : (
            <>
              <p className="text-a-quiet mt-4 mb-2 text-[13px]">Recent and favourites</p>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <Chip key={`${r.city}${r.tz}`} on={r.city === p.city} onClick={() => setPicked(r)}>
                    {flag(r.cc)} {r.city}
                  </Chip>
                ))}
              </div>
            </>
          )}
          <Button kind="plain" className="mt-4 w-full" busy={busy === "locate"} onClick={here}>
            <Icon name="locate" className="size-4" /> Use where I am now
          </Button>
        </>
      )}
      {error ? (
        <p role="alert" className="text-a-bad mt-3 text-[14px]">
          {error}
        </p>
      ) : null}
      {!p.held && !picked ? (
        <p className="text-a-quiet mt-4 text-[13px]">
          Only the town is ever shown, never closer. Want the site to stay put for a while?{" "}
          <button className="text-a-ink underline" onClick={async () => await act("hold", { hours: null }, `Held in ${p.city}`)}>
            Hold it in {p.city}
          </button>
        </p>
      ) : null}
    </Panel>
  );
}

/* ---- bedtime ---- */

function BedtimePanel({ data }: { data: AdminState }) {
  const [busy, setBusy] = useState<string | null>(null);
  const { shown, window: win, nights } = data.bedtime;
  const tz = data.place.tz;
  const typical = nights.length > 1 ? typicalBedtime(nights.map((n) => n.at), tz) : null;

  return (
    <Panel title="Bedtime" aside="“Hey Siri, good night”">
      {shown ? (
        <div className="border-a-ink mb-5 flex items-start justify-between gap-3 border-l-2 py-1 pl-3.5">
          <div>
            <p className="font-medium">Went to bed at {clockIn(tz, new Date(shown.at))}</p>
            <p className="text-a-quiet text-[13px]">
              {ago(shown.at)}. The site says so for {until(shown.until)} more.
            </p>
          </div>
          <Button kind="quiet" busy={busy === "wake"} onClick={async () => (setBusy("wake"), await act("wake", {}, "Good morning. The site has stopped saying you're in bed"), setBusy(null))}>
            I&apos;m up
          </Button>
        </div>
      ) : (
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-a-quiet text-[14.5px]">
            {win
              ? `You said good night at ${clockIn(tz, new Date(win.at))}, but you've been up since (a status, a push or a pin), so the site stopped saying you're in bed.`
              : "Awake, as far as the site knows. Saying “Hey Siri, good night” tells it you've gone to bed, for five hours."}
          </p>
          <Button kind="quiet" busy={busy === "bed"} onClick={async () => (setBusy("bed"), await act("bed", {}, "Good night. The site says you went to bed just now"), setBusy(null))}>
            Going to bed
          </Button>
        </div>
      )}

      {nights.length ? (
        <>
          <ul className="divide-a-line divide-y text-[14px]">
            {nights.slice(0, 7).map((n) => (
              <li key={n.at} className="flex justify-between gap-3 py-1.5">
                <span>{new Date(n.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz })}</span>
                <span className="text-a-quiet tabular-nums">
                  {clockIn(tz, new Date(n.at))}
                  {n.endedAt ? `, up at ${clockIn(tz, new Date(n.endedAt))}` : ""}
                  {n.via === "admin" ? " · from here" : ""}
                </span>
              </li>
            ))}
          </ul>
          {typical ? <p className="text-a-quiet mt-2 text-[13px]">Usually in bed by {typical}, over the last {nights.length} nights.</p> : null}
        </>
      ) : (
        <Empty>{data.shortcuts.goodnight ? "No good nights yet. Install the Good Night shortcut from the Site tab, then say it tonight." : "No good nights yet."}</Empty>
      )}
    </Panel>
  );
}

/* ---- health ---- */

function HealthPanel({ days, today, installed }: { days: HealthDay[]; today: string; installed: boolean }) {
  const t = days.find((d) => d.day === today);
  // The last 14 days, oldest first, with gaps where nothing came in.
  const span = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - (13 - i) * 86400_000).toISOString().slice(0, 10);
    return { day: d, steps: days.find((x) => x.day === d)?.steps ?? null };
  });
  const max = Math.max(1, ...span.map((s) => s.steps ?? 0));
  const withData = span.filter((s) => s.steps != null);
  const avg = withData.length ? Math.round(withData.reduce((a, s) => a + (s.steps ?? 0), 0) / withData.length) : null;

  return (
    <Panel title="Health" aside={t ? `Sent ${ago(t.at)}` : "From your iPhone"}>
      {days.length ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Steps", fmt(t?.steps)],
              ["Distance", t?.distanceKm != null ? `${fmt(t.distanceKm, 1)} km` : "–"],
              ["Active", t?.activeKcal != null ? `${fmt(t.activeKcal)} kcal` : "–"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="wide text-[24px] leading-tight font-bold tabular-nums">{v}</p>
                <p className="text-a-quiet text-[13px]">{k} today</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex h-24 items-end gap-1" role="img" aria-label="Steps per day, the last 14 days">
            {span.map((s) => (
              <div key={s.day} className="group relative flex h-full flex-1 items-end" title={`${s.day}: ${s.steps == null ? "nothing sent" : `${fmt(s.steps)} steps`}`}>
                <div className={`w-full ${s.day === today ? "bg-a-ink" : "bg-a-quiet/40"}`} style={{ height: s.steps == null ? 2 : `${Math.max(3, (s.steps / max) * 100)}%`, opacity: s.steps == null ? 0.3 : 1 }} />
              </div>
            ))}
          </div>
          <p className="text-a-quiet mt-2 flex justify-between text-[12.5px]">
            <span>14 days ago</span>
            <span>{avg != null ? `${fmt(avg)} a day on average` : ""}</span>
            <span>Today</span>
          </p>
          {t && t.activeKcal == null ? (
            <p className="text-a-quiet mt-3 text-[13px]">
              No active calories today. An iPhone on its own usually doesn&apos;t record them; an Apple Watch does. If you wear one and this stays empty, the shortcut&apos;s calorie step needs a look.
            </p>
          ) : null}
        </>
      ) : (
        <Empty>{installed ? "Nothing's come in yet. Run the 1618 Health shortcut once on your phone." : "Install the Health shortcut from the Site tab."}</Empty>
      )}
    </Panel>
  );
}
