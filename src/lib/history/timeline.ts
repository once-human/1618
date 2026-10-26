import "server-only";
import { cacheLife } from "next/cache";
import { q } from "@/lib/db";
import { scrobbles, type Scrobble } from "@/lib/presence/lastfm";
import { getSaved } from "@/lib/presence/pinterest";
import type { SavedPin, TodayEvent } from "@/lib/presence/types";
import { appleSong, ghEvents } from "@/lib/presence/server";
import { parseCredit } from "./credits";

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

  const [livePlays, storedPlays, gh, storedCode, saved, archived, moves, nights] = await Promise.all([
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
    q<{ at: string; data: { via?: string } }>("tl sleep", (db) =>
      db`SELECT at, data FROM events WHERE kind = 'sleep' AND at >= ${fromIso}`,
    ),
  ]);

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
        const song = await appleSong(raw.artist, raw.track, raw.album, 5).catch(() => null);
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
      detail: null,
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

  // Bedtimes ("Hey Siri, good night").
  for (const n of nights ?? [])
    out.push({
      kind: "sleep",
      at: new Date(n.at).toISOString(),
      title: "Went to bed",
      detail: n.data?.via === "siri" ? "said good night to Siri" : null,
      url: null,
    });

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
