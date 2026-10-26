import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { q } from "@/lib/db";
import { scrobbles, type Scrobble } from "@/lib/presence/lastfm";
import { getSaved } from "@/lib/presence/pinterest";
import type { SavedPin, TodayEvent } from "@/lib/presence/types";
import { appleSong, ghEvents, ghRecentCommits } from "@/lib/presence/server";
import { parseCredit } from "./credits";
import { spansBetween } from "@/lib/desk/server";
import { nightsIn, withMusic } from "@/lib/presence/sleep";
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
const HOURS = 24 * 30;

/**
 * The last thirty days across everything (the page opens on seven): runs of music, pushes, saves, runs,
 * workouts and bedtimes, newest first. Songs played close together become one entry
 * ("14 songs, mostly …") so it reads like a diary, not a log. Live sources
 * are merged with the history store, so nothing is missed if one is slow.
 * Cached for two minutes.
 */
export async function getTimeline(): Promise<{ hours: number; events: TodayEvent[] }> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 120, expire: 900 });
  cacheTag("timeline"); // saying good night refreshes it at once (api/bedtime)
  return buildTimeline(HOURS);
}

/** The same timeline over any stretch, up to a year: my admin panel (not cached, not public). */
export async function getTimelineFor(days: number): Promise<{ hours: number; events: TodayEvent[] }> {
  return buildTimeline(Math.max(1, Math.min(366, Math.round(days))) * 24);
}

async function buildTimeline(HOURS: number): Promise<{ hours: number; events: TodayEvent[] }> {
  const now = Date.now();
  const fromSec = Math.floor(now / 1000) - HOURS * 3600;
  const fromIso = new Date(fromSec * 1000).toISOString();

  const [livePlays, storedPlays, gh, recentCommits, storedCode, saved, archived, moves, nights, deskRows, sleepIn] = await Promise.all([
    scrobbles(fromSec, Math.floor(now / 1000), 6),
    q<{ track: string; artist: string; album: string | null; uts: string }>("tl plays", (db) =>
      db`SELECT track, artist, album, uts::text FROM scrobbles WHERE uts >= ${fromSec} ORDER BY uts`,
    ),
    ghEvents().catch(() => null),
    ghRecentCommits(fromIso.slice(0, 10)).catch(() => null),
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
    spansBetween(fromSec * 1000, now).catch(() => []),
    sleepInputs().catch(() => null),
  ]);

  const out: TodayEvent[] = [];

  // Music: merge live and stored plays, then sessions of plays under 30 minutes apart.
  const plays = new Map<string, Scrobble>();
  for (const s of [...(storedPlays ?? []).map((r) => ({ ...r, uts: Number(r.uts) })), ...(livePlays ?? [])])
    plays.set(`${s.uts}|${s.track}`, s);
  const list = [...plays.values()].sort((a, b) => a.uts - b.uts);
  let session: Scrobble[] = [];
  const rawOf = new Map<object, Scrobble>(); // each listed song -> the scrobble it came from, for the lookup
  const songOf = new Map<string, NonNullable<TodayEvent["songs"]>[number]>(); // scrobble -> its song, so a work session can list what played
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
          songOf.set(`${session[i].uts}|${session[i].track}`, song);
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
  // GitHub's public events feed can trail a push by hours. Commits are live, so any commit newer than the
  // newest push the feed knows about in that repo stands in for the push it hasn't listed yet.
  const newest = new Map<string, string>();
  for (const p of pushes.values()) if (p.at > (newest.get(p.repo) ?? "")) newest.set(p.repo, p.at);
  for (const c of recentCommits ?? []) if (c.at > (newest.get(c.repo) ?? "")) pushes.set(`c:${c.sha}`, { at: c.at, repo: c.repo });
  const sortedPushes = [...pushes.values()].sort((a, b) => a.at.localeCompare(b.at));
  const open = new Map<string, { at: string; until: string; n: number }>();
  // Runs of pushes; they become "worked on" rows together with the laptop's own record, below.
  const runs: { repo: string; from: number; to: number; n: number }[] = [];
  const closeRun = (repo: string, v: { at: string; until: string; n: number }) => runs.push({ repo, from: Date.parse(v.at), to: Date.parse(v.until), n: v.n });
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

  // The laptop and the pushes together. A work session is a stretch of code-ish time on the laptop (Claude, an
  // editor, a terminal) with gaps under 20 minutes; pushes inside or near it name the repo. Pushes with no laptop
  // record still count as work. Long chats, calls, YouTube and Netflix get rows of their own.
  const spans = (deskRows ?? []).filter((s) => s.lane === "doing");
  type Session = { from: number; to: number; active: number; claude: number; repos: Map<string, number>; apps: Set<string>; pushes: number };
  const sessions: Session[] = [];
  for (const s of spans) {
    if (!["claude", "coding", "terminal", "ai"].includes(s.kind)) continue;
    const from = Date.parse(s.start);
    const to = Date.parse(s.end);
    let cur = sessions[sessions.length - 1];
    if (!cur || from - cur.to > 20 * 60_000) {
      cur = { from, to, active: 0, claude: 0, repos: new Map(), apps: new Set(), pushes: 0 };
      sessions.push(cur);
    }
    cur.to = Math.max(cur.to, to);
    cur.active += to - from;
    if (s.kind === "claude" || s.kind === "ai") cur.claude += to - from;
    else if (s.kind === "coding") cur.apps.add(s.label);
    if (s.detail && !s.detail.includes(".")) cur.repos.set(s.detail, (cur.repos.get(s.detail) ?? 0) + (to - from));
  }
  for (const run of runs) {
    const near = sessions.find((x) => run.from <= x.to + 20 * 60_000 && run.to >= x.from - 20 * 60_000);
    if (near) {
      near.repos.set(run.repo, (near.repos.get(run.repo) ?? 0) + 1);
      near.pushes += run.n;
      near.from = Math.min(near.from, run.from);
      near.to = Math.max(near.to, run.to);
    } else {
      // Pushed with no laptop record (the agent was off, or Claude Code pushed from the cloud).
      sessions.push({ from: run.from, to: run.to, active: 0, claude: 0, repos: new Map([[run.repo, 1]]), apps: new Set(), pushes: run.n });
    }
  }
  const repoOf = (x: Session) => [...x.repos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  for (const x of sessions) {
    // The project comes first. If the laptop didn't see which one, take the nearest push or session that did.
    let repo = repoOf(x);
    if (!repo && x.claude >= 20 * 60_000) {
      const near = [...runs.map((r) => ({ repo: r.repo, from: r.from, to: r.to })), ...sessions.filter((y) => y !== x && repoOf(y)).map((y) => ({ repo: repoOf(y)!, from: y.from, to: y.to }))]
        .map((r) => ({ repo: r.repo, gap: Math.max(r.from - x.to, x.from - r.to, 0) }))
        .filter((r) => r.gap <= 3 * 3600_000)
        .sort((a, b) => a.gap - b.gap)[0];
      repo = near?.repo ?? null;
    }
    if (!repo && x.claude < 20 * 60_000) continue;
    if (!x.pushes && x.active < 15 * 60_000) continue;
    const withClaude = x.claude >= 5 * 60_000 || (x.claude > 0 && x.pushes > 0);
    const length = x.active >= 10 * 60_000 ? `, ${hm(x.active)}` : "";
    // What played during it (or just around it): every song, each once, newest first.
    const seenSong = new Set<string>();
    const songs = list
      .filter((p) => p.uts * 1000 >= x.from - 10 * 60_000 && p.uts * 1000 <= x.to + 10 * 60_000)
      .map((p) => songOf.get(`${p.uts}|${p.track}`))
      .filter((song): song is NonNullable<typeof song> => !!song && !seenSong.has(`${song.track}|${song.artist}`) && !!seenSong.add(`${song.track}|${song.artist}`))
      .reverse();
    const builtTo = songs.length ? `built to ${songs[0].track} by ${songs[0].artist}${songs.length > 1 ? ` and ${songs.length - 1} more` : ""}` : null;
    const pushes = x.pushes ? `${x.pushes} push${x.pushes === 1 ? "" : "es"}` : null;
    out.push({
      kind: "code",
      at: new Date(x.from).toISOString(),
      until: x.to - x.from > 60_000 ? new Date(x.to).toISOString() : undefined,
      title: repo ? `Worked on ${repo}${length}` : `Worked with Claude Code${length}`,
      detail: [withClaude ? "with Claude Code" : null, pushes, builtTo].filter(Boolean).join(" · ") || null,
      url: repo ? `https://github.com/${GH_USER}/${repo}` : null,
      songs: songs.length > 1 ? songs : undefined,
    });
  }

  // Calls, long chats, YouTube and Netflix: stretches of the same thing with gaps under 10 minutes.
  const stretches: { key: string; label: string; kind: string; from: number; to: number; total: number }[] = [];
  for (const s of spans) {
    const k = s.kind === "call" ? `call|${s.label}` : s.kind === "chat" ? `chat|${s.label}` : s.kind === "watching" ? `watch|${s.label}` : null;
    if (!k) continue;
    const from = Date.parse(s.start);
    const to = Date.parse(s.end);
    const cur = [...stretches].reverse().find((x) => x.key === k);
    if (cur && from - cur.to < 10 * 60_000) {
      cur.to = Math.max(cur.to, to);
      cur.total += to - from;
    } else stretches.push({ key: k, label: s.label, kind: s.kind, from, to, total: to - from });
  }
  for (const x of stretches) {
    const min = x.kind === "call" ? 5 : x.kind === "chat" ? 5 : 30;
    if (x.total < min * 60_000) continue;
    const name = x.label.replace(/^(On|In|Watching) /, "");
    const title =
      x.kind === "call"
        ? `${x.label}, ${hm(x.total)}`
        : x.kind === "chat"
          ? `Texting on ${name}, ${hm(x.total)}`
          : x.label === "Watching YouTube"
            ? `On YouTube for ${hm(x.total)}`
            : `${x.label}, ${hm(x.total)}`;
    out.push({ kind: x.kind === "call" ? "call" : x.kind === "chat" ? "chat" : "watch", at: new Date(x.from).toISOString(), until: new Date(x.to).toISOString(), title, detail: null, url: null });
  }
  // Music during a work session says so.
  for (const e of out)
    if (e.kind === "music") {
      const t = Date.parse(e.at);
      const w = sessions.find((x) => t >= x.from - 10 * 60_000 && t <= x.to);
      const repo = w ? [...w.repos].sort((a, b) => b[1] - a[1])[0]?.[0] : null;
      if (repo) e.detail = `${e.detail ? `${e.detail} · ` : ""}while working on ${repo}`;
    }

  // Nights. A good night counts as sleep only if I then went quiet for an hour or more (see nightsIn); one I
  // stayed up through says so. Anything else is worked out from the quiet, and a night I never slept is an
  // all-nighter, set at that night's midnight. Music doesn't count as being up: I fall asleep to it.
  const told = (nights ?? []).map((n) => ({ at: Date.parse(n.at), ended: n.data?.endedAt ? Date.parse(n.data.endedAt) : null }));
  const handsOn: number[] = [];
  for (const p of sortedPushes) handsOn.push(Date.parse(p.at));
  for (const p of pins) handsOn.push(Date.parse(p.at!));
  for (const m of moves ?? []) handsOn.push(Date.parse(m.at));
  for (const sp of spans) {
    if (sp.kind === "idle") continue;
    const from = Date.parse(sp.start);
    const to = Date.parse(sp.end);
    for (let t = from; t < to; t += 5 * 60_000) handsOn.push(t);
    handsOn.push(to);
  }
  const clockOf = (ms: number) => puneClock(new Date(ms).toISOString());
  const night = nightsIn({ now, tz: "Asia/Kolkata", bursts: withMusic(handsOn.filter(Number.isFinite), list.map((p) => p.uts * 1000)), past: sleepIn?.past ?? [], horizon: HOURS * 3600_000, told });
  for (const n of night) {
    if (n.kind === "allnighter") {
      out.push({ kind: "sleep", at: new Date(n.at).toISOString(), title: "Pulled an all-nighter", detail: "no sleep that night, still up after 7 am", url: null });
    } else if (n.kind === "nap") {
      if (n.from < now - HOURS * 3600_000 + 3600_000) continue;
      out.push({
        kind: "sleep",
        at: new Date(n.from).toISOString(),
        until: n.ongoing ? undefined : new Date(n.to).toISOString(),
        title: n.ongoing ? "Napping, probably" : `Nap, about ${hours(n.to - n.from)}`,
        detail: "quiet in the day after a night with no sleep",
        url: null,
      });
    } else if (n.kind === "restless") {
      out.push({ kind: "sleep", at: new Date(n.at).toISOString(), title: "Said good night, didn't sleep", detail: n.upAt ? `up again at ${clockOf(n.upAt)}` : "still up", url: null });
    } else if (n.told) {
      const parts = [`good night at ${clockOf(n.goodNight!)}`];
      if (n.from - n.goodNight! >= 30 * 60_000) parts.push(`asleep by ${clockOf(n.from)}`);
      if (n.upAt) parts.push(`up at ${clockOf(n.upAt)}`);
      out.push({
        kind: "sleep",
        at: new Date(n.from).toISOString(),
        until: n.ongoing ? undefined : new Date(n.to).toISOString(),
        title: n.ongoing ? "Said good night" : `Slept ${hours(n.to - n.from)}`,
        detail: parts.join(", "),
        url: null,
      });
    } else {
      if (n.from < now - HOURS * 3600_000 + 3600_000) continue; // starts before the window: can't say when I fell asleep
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
