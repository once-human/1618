import "server-only";
import { lastBedtime } from "@/lib/presence/bedtime";
import { bedClock, inBed } from "@/lib/presence/asleep";
import { cacheLife } from "next/cache";
import { kvGet, q } from "@/lib/db";
import { getMusic, getPlace, getPresence } from "@/lib/presence/server";
import { getSaved } from "@/lib/presence/pinterest";
import { soundtrack } from "@/lib/history/soundtrack";
import { owner, telegramConfigured } from "@/lib/talk/telegram";
import { projects } from "@/content/projects";
import { getLive as getDesk } from "@/lib/desk/server";
import { skyAt } from "@/lib/sky";

/**
 * Everything this site does, where to find it, and what it's doing right
 * now: the list on /status. Each line is worked out from the real thing
 * (the same data the feature itself uses), never written by hand, so a
 * feature that stops working shows up here as stopped.
 *
 * "ok": true = working, false = broken, null = waiting on something (not set
 * up yet, or nothing to show yet).
 */
export interface Feature {
  id: string;
  group: "With you, live" | "From my day" | "Things you can do" | "Outside the browser";
  name: string;
  what: string;
  where: { href: string; label: string }[];
  ok: boolean | null;
  state: string;
}

const ago = (iso: string | number, now = Date.now()) => {
  const m = Math.round((now - (typeof iso === "number" ? iso : Date.parse(iso))) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};
const n = (x: number) => x.toLocaleString("en-IN");
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;
const puneDay = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export async function checkFeatures(): Promise<Feature[]> {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });

  const withRepo = projects.filter((p) => p.repo);
  const [presence, tracks, saved, counts, today, me, statusKv, soundtracks, setPlace, lastBed, desk] = await Promise.all([
    getPresence(),
    getMusic().catch(() => null),
    getSaved(4).catch(() => null),
    q<{ plays: number; first: string | null; pins: number; events: number; songs: number; senders: number; notes: number; threads: number; waiting: number; health: string | null }>(
      "features counts",
      (db) =>
        db`SELECT (SELECT count(*)::int FROM scrobbles) AS plays,
                  (SELECT to_char(to_timestamp(min(uts)) AT TIME ZONE 'Asia/Kolkata', 'FMDD Mon') FROM scrobbles) AS first,
                  (SELECT count(*)::int FROM pins) AS pins,
                  (SELECT count(*)::int FROM events) AS events,
                  (SELECT count(*)::int FROM submissions WHERE kind = 'song' AND NOT hidden) AS songs,
                  (SELECT count(*)::int FROM submissions WHERE kind = 'song' AND sender IS NOT NULL) AS senders,
                  (SELECT count(*)::int FROM submissions WHERE kind = 'note' AND NOT hidden) AS notes,
                  (SELECT count(*)::int FROM talk_threads) AS threads,
                  (SELECT count(*)::int FROM talk_threads t WHERE (SELECT side FROM talk_messages m WHERE m.thread = t.id ORDER BY id DESC LIMIT 1) = 'visitor') AS waiting,
                  (SELECT max(day)::text FROM health_days) AS health`,
    ),
    q<{ people: number; places: number }>("features today", (db) =>
      db`SELECT count(*)::int AS people, count(DISTINCT (city, country)) FILTER (WHERE city IS NOT NULL)::int AS places
         FROM visitors WHERE day = ${puneDay()}::date`,
    ),
    telegramConfigured() ? owner() : Promise.resolve(null),
    kvGet<{ setAt: string }>("status"),
    Promise.all(withRepo.map((p) => soundtrack(p.repo!).catch(() => null))),
    getPlace(),
    lastBedtime(),
    getDesk(),
  ]);
  const c = counts?.[0];
  const now = Date.now();
  const place = presence.place;
  const w = presence.weather;
  const playing = tracks?.find((t) => t.nowPlaying) ?? null;
  const last = tracks?.[0] ?? null;
  const live = !!me;
  const withSound = soundtracks.filter((s) => s && s.plays >= 3).length;
  const sky = w?.sun?.length ? skyAt(now, w.sun, { cloud: w.cloud, rain: w.rain }) : null;
  const phase = sky ? { night: "night", dawn: "around sunrise", day: "daylight", dusk: "around sunset" }[sky.phase] : null;

  const f: Feature[] = [
    {
      id: "here",
      group: "With you, live",
      name: "Who's here",
      what: "How many people are on the site right now and which towns they're in. Each person counts once, however many tabs or browsers they have open. On wide screens, a dot on the right edge shows where on the page each of them is.",
      where: [
        { href: "/", label: "top of the home page" },
        { href: "/now", label: "/now" },
        { href: "/status", label: "footer, every page" },
      ],
      ok: true, // the live count is filled in on the page itself
      state: "",
    },
    {
      id: "talk",
      group: "With you, live",
      name: "Talk to me",
      what: "Write to me from the site or a terminal (curl -L -d \"hi\" onkaryaglewad.in/talk). One chat per browser, under one name (a new name starts it fresh); delete it for good, or carry it to another device with its link. My reply shows up on your screen while you're there, or waits for you on any page if you've left.",
      where: [
        { href: "/talk", label: "/talk" },
        { href: "/#talk", label: "end of the day" },
      ],
      ok: c ? true : false,
      state: `${live ? "Goes straight to my phone" : "Open; I answer from the site (my phone isn't hooked up yet)"}. ${c ? (c.threads ? `${plural(c.threads, "conversation")} so far${c.waiting ? `, ${n(c.waiting)} waiting on me` : ""}.` : "No conversations yet.") : ""}`,
    },
    {
      id: "visitors",
      group: "With you, live",
      name: "This month's visitors",
      what: "A map of where this month's visitors came from, by town. Towns and counts only.",
      where: [{ href: "/now#visitors", label: "/now" }],
      ok: today ? true : false,
      state: today?.[0] ? `${plural(today[0].people, "person", "people")} from ${plural(today[0].places, "place")} so far today, India time.` : "Can't read today's visits.",
    },
    {
      id: "played",
      group: "With you, live",
      name: "Onkar played your song",
      what: "Send me a song, and the next time you visit, the site tells you if I've played it since, and how many times.",
      where: [{ href: "/#send-a-song", label: "send a song" }],
      ok: c ? true : false,
      state: c ? (c.senders ? `${plural(c.senders, "song")} sent since this started.` : "No songs sent since this started.") : "",
    },
    {
      id: "listening",
      group: "From my day",
      name: "Listening",
      what: "What I'm playing right now, or what I played last, with a 30-second preview. Plus what's on repeat this month.",
      where: [
        { href: "/#listening", label: "home" },
        { href: "/now", label: "/now" },
        { href: "/status", label: "footer" },
      ],
      ok: tracks ? true : false,
      state: playing ? `Playing ${playing.track} by ${playing.artist} right now.` : last ? `Last played ${last.track} by ${last.artist}${last.at ? `, ${ago(last.at, now)}` : ""}.` : "Last.fm isn't answering.",
    },
    {
      id: "building",
      group: "From my day",
      name: "Building",
      what: "My latest push to GitHub, and when each project's code last changed.",
      where: [
        { href: "/now", label: "/now" },
        { href: "/work", label: "project pages" },
      ],
      ok: presence.github ? true : null,
      state: presence.github ? `${presence.github.action} ${presence.github.repo}, ${ago(presence.github.at, now)}.` : "Nothing public lately.",
    },
    {
      id: "saved",
      group: "From my day",
      name: "Saved",
      what: "What I've been saving on Pinterest, and the board I'm saving to most.",
      where: [{ href: "/#saved", label: "home" }],
      ok: saved ? true : false,
      state: saved?.pins[0] ? `Last pin${saved.pins[0].board ? ` to ${saved.pins[0].board}` : ""}${saved.pins[0].at ? `, ${ago(saved.pins[0].at, now)}` : ""}.` : "Pinterest isn't answering.",
    },
    {
      id: "sky",
      group: "From my day",
      name: "The sky over me",
      what: "/now takes on the colours of the sky where I am: light by day, warm at sunrise and sunset, dark with stars at night, greyer under cloud, with rain when it's raining.",
      where: [{ href: "/now", label: "/now" }],
      ok: w ? true : false,
      state: w ? `${w.tempC}°, ${w.label.toLowerCase()} in ${place.city}${phase ? `, ${phase}` : ""}.` : "No weather right now, so /now stays plain.",
    },
    {
      id: "status",
      group: "From my day",
      name: "My status",
      what: "A line I set from my phone (\"heads-down till 6\"). When it's empty, the site works out where I am from what I'm doing.",
      where: [
        { href: "/", label: "home" },
        { href: "/now", label: "/now" },
      ],
      ok: true,
      state: presence.status ? `"${presence.status.text}", set ${ago(presence.status.setAt, now)}.` : statusKv ? `None right now. Last set ${ago(statusKv.value.setAt, now)}.` : "None set right now.",
    },
    {
      id: "bedtime",
      group: "From my day",
      name: "Gone to bed",
      what: "When I say \"Hey Siri, good night\", my phone tells the site. It says when I went to bed for seven hours. \"Hey Siri, good morning\" ends it, and so does doing something once I've been asleep a while (an hour for the laptop, a push or a pin, two for music). The timeline keeps it. When I haven't said anything, quiet nights read as slept.",
      where: [
        { href: "/", label: "home" },
        { href: "/now", label: "/now" },
      ],
      ok: true,
      state: (() => {
        const bed = inBed(presence, now, saved?.pins[0]?.at);
        if (bed) return `Went to bed at ${bedClock(bed, place.tz)}, ${ago(bed.at, now)}.`;
        return lastBed ? `Up. Last good night ${ago(lastBed.at, now)}, at ${bedClock(lastBed, place.tz)}.` : "Waiting for the first good night.";
      })(),
    },
    {
      id: "laptop",
      group: "From my day",
      name: "My laptop",
      what: "A small agent on my laptop says what I'm doing there: the app or site by name, the repo I'm in, whether Claude Code is working, what's playing. Never window titles, and YouTube is only ever \"YouTube\".",
      where: [
        { href: "/", label: "the Pulse" },
        { href: "/now", label: "/now" },
      ],
      ok: desk.online ? true : null,
      state: desk.online
        ? `Reporting now: ${desk.doing?.label ?? "at the laptop"}${desk.doing?.detail ? ` (${desk.doing.detail})` : ""}.`
        : desk.lastSeen
          ? `Not reporting right now. Last heard ${ago(desk.lastSeen, now)}.`
          : "The agent hasn't reported yet.",
    },
    {
      id: "place",
      group: "From my day",
      name: "Where I am",
      what: "My city, sent by my phone, for the clock and weather. City only, never closer.",
      where: [{ href: "/status", label: "footer, every page" }],
      ok: true,
      state: setPlace.setAt ? `${place.city}, sent ${ago(setPlace.setAt, now)}.` : `${place.city} (the default; my phone hasn't sent a city yet).`,
    },
    {
      id: "steps",
      group: "From my day",
      name: "Steps",
      what: "Today's steps, distance and active calories from Apple Health, sent by my phone.",
      where: [{ href: "/now", label: "/now" }],
      ok: c?.health ? true : null,
      state: presence.health?.steps ? `${n(presence.health.steps)} steps${presence.health.distanceKm ? ` and ${presence.health.distanceKm} km` : ""} today, sent ${ago(presence.health.at, now)}.` : c?.health ? `Last sent for ${c.health}.` : "My phone hasn't sent anything yet.",
    },
    {
      id: "soundtrack",
      group: "From my day",
      name: "Built to this soundtrack",
      what: "On each project page: what I was listening to while I built it, matched from my commits against my listening history.",
      where: withRepo.slice(0, 3).map((p) => ({ href: `/work/${p.slug}`, label: p.name })),
      ok: withSound ? true : null,
      state: c?.first
        ? `${withSound} of ${withRepo.length} projects have enough to show. My listening history starts ${c.first}, so it fills in as I build.`
        : "No listening history yet.",
    },
    {
      id: "history",
      group: "From my day",
      name: "History and replay",
      what: "Everything above, kept: search any stretch of days, top tens, and the year so far, recap-style.",
      where: [{ href: "/history", label: "/history" }],
      ok: c ? true : false,
      state: c ? `${n(c.plays)} plays, ${n(c.pins)} pins and ${n(c.events)} pushes and workouts stored.` : "The store isn't answering.",
    },
    {
      id: "send-song",
      group: "Things you can do",
      name: "Send me a song",
      what: "Search any song and send it to me. It shows on the site once I've seen it.",
      where: [{ href: "/#send-a-song", label: "home, under listening" }],
      ok: c ? true : false,
      state: c ? (c.songs ? `${plural(c.songs, "song")} up.` : "None yet. Be the first.") : "",
    },
    {
      id: "guestbook",
      group: "Things you can do",
      name: "Guestbook",
      what: "Leave a line. Short, public, kept.",
      where: [{ href: "/#guestbook", label: "end of the day" }],
      ok: c ? true : false,
      state: c ? (c.notes ? `${plural(c.notes, "note")} so far.` : "Empty so far. Be the first.") : "",
    },
    {
      id: "menu",
      group: "Things you can do",
      name: "The menu",
      what: "Press ⌘K, Ctrl+K or / on any page to jump anywhere, play what I'm listening to, or start talking.",
      where: [{ href: "/status", label: "\"menu\" in the top bar" }],
      ok: true,
      state: "On every page.",
    },
    {
      id: "curl",
      group: "Outside the browser",
      name: "curl",
      what: "The live site as text, for terminals.",
      where: [{ href: "/api/curl?plain", label: "see it as text" }],
      ok: true, // checked live on the page
      state: "",
    },
    {
      id: "previews",
      group: "Outside the browser",
      name: "Link previews",
      what: "Share any page and it gets its own card: its word and one line about it.",
      where: [{ href: "/status#previews", label: "below" }],
      ok: true,
      state: "",
    },
  ];
  return f;
}
