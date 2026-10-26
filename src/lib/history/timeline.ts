import "server-only";
import { cacheLife } from "next/cache";
import { q } from "@/lib/db";
import { scrobbles, type Scrobble } from "@/lib/presence/lastfm";
import { getSaved } from "@/lib/presence/pinterest";
import type { SavedPin, TodayEvent } from "@/lib/presence/types";
import { appleSong, ghEvents } from "@/lib/presence/server";
import { parseCredit } from "./credits";
import { buildSpans, type Sample } from "@/lib/desk/model";
import { nightsIn } from "@/lib/presence/sleep";
import { sleepInputs } from "@/lib/presence/sleepData";
import { puneClock } from "@/lib/time";

const hm = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
};
const hours = (ms: number) => {
  const h = Math.round((ms / 3600_000) * 2) / 2;
  return `${Math.floor(h)}${h % 1 ? "½" : ""} hour${h === 1 ? "" : "s"}`;
};

const GH_USER = "once-human";
const HOURS = 48;

/**
 * The last 48 hours across everything: runs of music, pushes, saves, runs,
 * workouts and bedtimes, newest first. Songs played close together become one entry
 * ("14 songs, mostly …") so it reads like a diary, not a log. Live sources
 * are merged with the history store, so nothing is missed if one is slow.
 * Cached for two minutes.
 */
export async function getTimeline(): Promise<{ hours: number; events: TodayEvent[] }> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 120, expire: 900 });

  const now = Date.now();
  const fromSec = Math.floor(now / 1000) - HOURS * 3600;
  const fromIso = new Date(fromSec * 1000).toISOString();

  const [livePlays, storedPlays, gh, storedCode, saved, archived, moves, nights, deskRows, sleepIn] = await Promise.all([
    scrobbles(fromSec, Math.floor(now / 1000), 6),
    q<{ track: string; artist: string; album: string | null; uts: string }>("tl plays", (db) =>
      db`SELECT track, artist, album, uts::text FROM scrobbles WHERE uts >= ${fromSec} ORDER BY uts`,
    ),
    ghEvents().catch(() => null),
    q<{ id: string; at: string; data: { repo: string; commits: number | null } }>("tl code", (db) =>
      db`SELECT id, at, data FROM events WHERE kind = 'code' AND at >= ${fromIso}`,
    ),
    getSaved(4).catch(() => null),
    q<{ data: SavedPin }>("tl pins", (db) => db`SELECT data FROM pins WHERE saved_at >= ${fromIso}`),
    q<{ kind: string; at: string; data: Record<string, unknown> }>("tl moves", (db) =>
      db`SELECT kind, at, data FROM events WHERE kind IN ('activity', 'workout') AND at >= ${fromIso}`,
    ),
    q<{ at: string; data: { via?: string; endedAt?: string } }>("tl sleep", (db) =>
      db`SELECT at, data FROM events WHERE kind = 'sleep' AND at >= ${fromIso}`,
    ),
    q<{ data: Sample }>("tl desk", (db) => db`SELECT data FROM desk_samples WHERE at >= ${fromIso} ORDER BY at`),
    sleepInputs().catch(() => null),
  ]);

  // What was playing around a moment, for "built to …": the plays from 45 minutes before to 10 after.
  const builtTo = (fromMs: number, toMs: number): string | null => {
    const near = list.filter((s) => s.uts * 1000 >= fromMs - 45 * 60_000 && s.uts * 1000 <= toMs + 10 * 60_000).map((s) => parseCredit(s.track, s.artist));
    if (!near.length) return null;
    const tracks = new Map<string, { n: number; title: string; credit: string }>();
    const artists = new Map<string, number>();
    for (const c of near) {
      const k = `${c.title}|${c.credit}`;
      tracks.set(k, { n: (tracks.get(k)?.n ?? 0) + 1, title: c.title, credit: c.credit });
      for (const a of c.artists) artists.set(a, (artists.get(a) ?? 0) + 1);
    }
    const top = [...tracks.values()].sort((a, b) => b.n - a.n)[0];
    if (top.n >= 2 || tracks.size <= 2) return `built to ${top.title} by ${top.credit}`;
    const as = [...artists].sort((a, b) => b[1] - a[1]).map(([a]) => a);
    return `built to ${as.slice(0, 2).join(" and ")}`;
  };

  const out: TodayEvent[] = [];

  // Music: merge live and stored plays, then sessions of plays under 30 minutes apart.
  const plays = new Map<string, Scrobble>();
  for (const s of [...(storedPlays ?? []).map((r) => ({ ...r, uts: Number(r.uts) })), ...(livePlays ?? [])])
    plays.set(`${s.uts}|${s.track}`, s);
  const list = [...plays.values()].sort((a, b) => a.uts - b.uts);
  let session: Scrobble[] = [];
  const rawOf = new Map<object, Scrobble>(); // each listed song -> the scrobble it came from, for the lookup
  const flush = () => {
    if (!session.length) return;
    // Count every artist on every song, so "mostly X" means the artist I actually heard most.
    const count = new Map<string, number>();
    const parsed = session.map((s) => parseCredit(s.track, s.artist));
    for (const c of parsed) for (const a of c.artists) count.set(a, (count.get(a) ?? 0) + 1);
    const top = [...count.entries()].sort((a, b) => b[1] - a[1]);
    const one = session.length === 1;
    out.push({
      kind: "music",
      at: new Date(session[0].uts * 1000).toISOString(),
      until: one ? undefined : new Date(session[session.length - 1].uts * 1000).toISOString(),
      title: one ? `Played ${parsed[0].title}` : `Listened to ${session.length} songs`,
      detail: one
        ? parsed[0].credit
        : top[0][1] > 1
          ? `mostly ${top[0][0]}`
          : top
              .slice(0, 2)
              .map(([a]) => a)
              .join(" · "),
      url: null,
      songs: parsed
        .map((c, i) => {
          const song = { track: c.title, artist: c.credit, album: session[i].album, image: null, preview: null, url: null };
          rawOf.set(song, session[i]);
          return song;
        })
        .reverse(),
    });
    session = [];
  };
  for (const s of list) {
    if (session.length && s.uts - session[session.length - 1].uts > 30 * 60) flush();
    session.push(s);
  }
  flush();

  // Every song gets its cover and 30-second clip where the store has them (newest first; lookups are
  // cached for weeks, so only the first visit is slow, and a late one shows on the next refresh).
  {
    const todo = out
      .filter((e) => e.kind === "music")
      .reverse()
      .flatMap((e) => e.songs ?? [])
      .slice(0, 60);
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const s = todo[next++];
        const raw = rawOf.get(s)!;
        const song = await appleSong(raw.artist, raw.track, raw.album, 7).catch(() => null);
        if (song) Object.assign(s, { image: song.art, preview: song.preview, url: song.link });
      }
    };
    await Promise.race([Promise.all([worker(), worker(), worker(), worker()]), new Promise((r) => setTimeout(r, 7000))]);
    for (const e of out) if (e.kind === "music" && e.songs?.length === 1) Object.assign(e, { image: e.songs[0].image, preview: e.songs[0].preview });
  }

  // Code: pushes per repo, merged when within an hour of each other.
  const pushes = new Map<string, { at: string; repo: string }>();
  for (const e of gh ?? [])
    if (e.type === "PushEvent" && e.created_at >= fromIso)
      pushes.set(`gh:${e.id}`, { at: e.created_at, repo: e.repo.name.split("/")[1] });
  for (const r of storedCode ?? []) pushes.set(r.id, { at: new Date(r.at).toISOString(), repo: r.data.repo });
  const sortedPushes = [...pushes.values()].sort((a, b) => a.at.localeCompare(b.at));
  const open = new Map<string, { at: string; until: string; n: number }>();
  const closeRun = (repo: string, v: { at: string; until: string; n: number }) =>
    out.push({
      kind: "code",
      at: v.at,
      until: v.n > 1 ? v.until : undefined,
      title: v.n > 1 ? `Pushed to ${repo} ${v.n} times` : `Pushed to ${repo}`,
      detail: builtTo(Date.parse(v.at), Date.parse(v.until)),
      url: `https://github.com/${GH_USER}/${repo}`,
    });
  for (const p of sortedPushes) {
    const cur = open.get(p.repo);
    if (cur && Date.parse(p.at) - Date.parse(cur.until) < 3600_000) {
      cur.until = p.at;
      cur.n++;
    } else {
      if (cur) closeRun(p.repo, cur);
      open.set(p.repo, { at: p.at, until: p.at, n: 1 });
    }
  }
  for (const [repo, v] of open) closeRun(repo, v);

  // Pins: saves grouped by board and by day.
  const seen = new Set<string>();
  const pins = [...(saved?.pins ?? []), ...(archived ?? []).map((r) => r.data)].filter((p) => {
    if (!p.at || seen.has(p.id) || p.at < fromIso) return false;
    seen.add(p.id);
    return true;
  });
  const groups = new Map<string, SavedPin[]>();
  for (const p of pins) {
    const k = `${p.board ?? ""}|${p.at!.slice(0, 10)}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const g of groups.values()) {
    const s = g.sort((a, b) => a.at!.localeCompare(b.at!));
    out.push({
      kind: "pin",
      at: s[0].at!,
      until: s.length > 1 ? s[s.length - 1].at! : undefined,
      title: s.length === 1 ? "Saved a pin" : `Saved ${s.length} pins`,
      detail: s[0].board ? `to ${s[0].board}` : null,
      url: s[0].boardUrl ?? s[0].url,
      image: s[s.length - 1].imageSmall,
    });
  }

  // Runs, rides and workouts.
  for (const m of moves ?? []) {
    const d = m.data;
    const km = typeof d.distanceM === "number" ? d.distanceM / 1000 : typeof d.distanceKm === "number" ? d.distanceKm : null;
    const mins = typeof d.movingS === "number" ? d.movingS / 60 : typeof d.minutes === "number" ? d.minutes : null;
    const type = String(d.type ?? "Workout");
    out.push({
      kind: "move",
      at: new Date(m.at).toISOString(),
      title: km ? `${verb(type)} ${km.toFixed(1)} km` : `${type}${mins ? `, ${Math.round(mins)} min` : ""}`,
      detail: km && mins ? `${Math.round(mins)} min${typeof d.name === "string" ? `, ${d.name}` : ""}` : null,
      url: typeof d.url === "string" ? d.url : null,
    });
  }

  // The laptop: work sittings per repo, and long YouTube stretches, from the agent's samples.
  const spans = buildSpans((deskRows ?? []).map((r) => r.data)).filter((s) => s.lane === "doing");
  const sittings: { key: string; repo: string | null; kind: "work" | "youtube"; from: number; to: number; claude: number; total: number }[] = [];
  for (const s of spans) {
    const work = (s.kind === "claude" || s.kind === "coding" || s.kind === "terminal") && s.detail && !s.detail.includes(".");
    const yt = s.kind === "watching" && s.label === "Watching YouTube";
    if (!work && !yt) continue;
    const key = work ? `w|${s.detail}` : "yt";
    const from = Date.parse(s.start);
    const to = Date.parse(s.end);
    const cur = [...sittings].reverse().find((x) => x.key === key);
    if (cur && from - cur.to < 20 * 60_000) {
      cur.to = Math.max(cur.to, to);
      cur.total += to - from;
      if (s.kind === "claude") cur.claude += to - from;
    } else sittings.push({ key, repo: work ? s.detail : null, kind: work ? "work" : "youtube", from, to, claude: s.kind === "claude" ? to - from : 0, total: to - from });
  }
  for (const x of sittings) {
    if (x.total < (x.kind === "work" ? 15 : 30) * 60_000) continue;
    const music = x.kind === "work" ? builtTo(x.from + 45 * 60_000, x.to - 10 * 60_000) : null;
    out.push({
      kind: "desk",
      at: new Date(x.from).toISOString(),
      until: new Date(x.to).toISOString(),
      title: x.kind === "youtube" ? `On YouTube for ${hm(x.total)}` : `${x.claude > x.total / 2 ? "Built" : "Worked on"} ${x.repo}${x.claude > x.total / 2 ? " with Claude Code" : ""}, ${hm(x.total)}`,
      detail: music,
      url: x.kind === "work" ? `https://github.com/${GH_USER}/${x.repo}` : null,
    });
  }
  // Music during a work sitting says so.
  for (const e of out)
    if (e.kind === "music") {
      const t = Date.parse(e.at);
      const w = sittings.find((x) => x.kind === "work" && t >= x.from - 10 * 60_000 && t <= x.to);
      if (w) e.detail = `${e.detail ? `${e.detail} · ` : ""}while building ${w.repo}`;
    }

  // Nights. The ones I said good night to, with how long I slept when I said good morning; the others worked out from the quiet.
  const told = (nights ?? []).map((n) => ({ at: Date.parse(n.at), ended: n.data?.endedAt ? Date.parse(n.data.endedAt) : null, siri: n.data?.via === "siri" }));
  for (const n of told)
    out.push({
      kind: "sleep",
      at: new Date(n.at).toISOString(),
      until: n.ended ? new Date(n.ended).toISOString() : undefined,
      title: n.ended ? `Slept ${hours(n.ended - n.at)}` : "Went to bed",
      detail: n.ended ? `good night at ${puneClock(new Date(n.at).toISOString())}, good morning at ${puneClock(new Date(n.ended).toISOString())}` : n.siri ? "said good night to Siri" : null,
      url: null,
    });
  if (sleepIn) {
    for (const n of nightsIn({ now, tz: "Asia/Kolkata", bursts: sleepIn.bursts, past: sleepIn.past })) {
      if (n.kind === "allnighter") {
        out.push({ kind: "sleep", at: new Date(n.at).toISOString(), title: "Pulled an all-nighter", detail: "no sleep that night, going by everything else", url: null });
        continue;
      }
      if (n.from < now - HOURS * 3600_000 + 3600_000) continue; // starts before the window: can't say when I fell asleep
      if (told.some((t) => t.at >= n.from - 3 * 3600_000 && t.at <= n.to)) continue;
      out.push({
        kind: "sleep",
        at: new Date(n.from).toISOString(),
        until: n.ongoing ? undefined : new Date(n.to).toISOString(),
        title: n.ongoing ? "Asleep, probably" : `Slept about ${hours(n.to - n.from)}`,
        detail: n.ongoing ? "quiet everywhere since then" : "going by the quiet, didn't say good night",
        url: null,
      });
    }
  }

  out.sort((a, b) => (b.until ?? b.at).localeCompare(a.until ?? a.at));
  return { hours: HOURS, events: out };
}

function verb(type: string) {
  const t = type.toLowerCase();
  if (t.includes("run")) return "Ran";
  if (t.includes("ride") || t.includes("cycl")) return "Rode";
  if (t.includes("walk") || t.includes("hike")) return "Walked";
  if (t.includes("swim")) return "Swam";
  return type;
}
