import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { q } from "@/lib/db";
import { ghHeaders } from "@/lib/presence/server";
import { sessions } from "./sessions";

/**
 * "Built to this soundtrack": what I was listening to while I worked on a
 * project. Its commits are grouped into sittings (see ./sessions.ts), and the
 * plays that fall inside them are ranked the same way the history ranks them.
 * Only covers the time since my listening history begins.
 */
export interface Soundtrack {
  commits: number;
  sittings: number;
  minutes: number;
  plays: number;
  since: string;
  tracks: { track: string; artist: string; plays: number; link: string | null }[];
  artists: { name: string; plays: number }[];
}

async function commitTimes(repo: string, sinceIso: string): Promise<number[] | null> {
  const times: number[] = [];
  for (let page = 1; page <= 3; page++) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/once-human/${repo}/commits?author=once-human&since=${sinceIso}&per_page=100&page=${page}`,
        { headers: ghHeaders(), signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return page === 1 ? null : times;
      const list = (await res.json()) as { commit: { author?: { date?: string }; committer?: { date?: string } } }[];
      for (const c of list) {
        const d = c.commit.author?.date ?? c.commit.committer?.date;
        if (d) times.push(Math.floor(Date.parse(d) / 1000));
      }
      if (list.length < 100) break;
    } catch {
      return page === 1 ? null : times;
    }
  }
  return times;
}

export async function soundtrack(repo: string): Promise<Soundtrack | null> {
  "use cache: remote";
  cacheTag("github", `soundtrack:${repo}`);

  const first = await q<{ uts: string | null }>("soundtrack since", (db) => db`SELECT min(uts) AS uts FROM scrobbles`);
  const since = first?.[0]?.uts ? Number(first[0].uts) : null;
  if (!since) {
    cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
    return null;
  }
  const times = await commitTimes(repo, new Date(since * 1000).toISOString());
  if (!times) {
    cacheLife({ stale: 60, revalidate: 300, expire: 900 }); // GitHub said no; ask again soon
    return null;
  }
  cacheLife({ stale: 1800, revalidate: 3600, expire: 86400 });

  const sits = sessions(times);
  const base = { commits: times.length, sittings: sits.length, minutes: Math.round(sits.reduce((a, s) => a + (s.to - s.from), 0) / 60), since: new Date(since * 1000).toISOString() };
  if (!sits.length) return { ...base, plays: 0, tracks: [], artists: [] };

  const froms = sits.map((s) => s.from);
  const tos = sits.map((s) => s.to);
  const [count, tracks, artists] = await Promise.all([
    q<{ n: number }>("soundtrack plays", (db) =>
      db`SELECT count(*)::int AS n FROM scrobbles s JOIN unnest(${froms}::bigint[], ${tos}::bigint[]) AS w(f, t) ON s.uts >= w.f AND s.uts < w.t`,
    ),
    q<{ track: string; artist: string; plays: number; link: string | null }>("soundtrack tracks", (db) =>
      db`SELECT mode() WITHIN GROUP (ORDER BY coalesce(s.title, s.track)) AS track,
                mode() WITHIN GROUP (ORDER BY coalesce(s.credit, s.artist)) AS artist,
                count(*)::int AS plays, max(m.link) AS link
         FROM scrobbles s JOIN unnest(${froms}::bigint[], ${tos}::bigint[]) AS w(f, t) ON s.uts >= w.f AND s.uts < w.t
         LEFT JOIN track_meta m ON m.track_key = s.track_key
         GROUP BY coalesce(s.song_key, s.track_key) ORDER BY plays DESC, max(s.uts) DESC LIMIT 5`,
    ),
    q<{ name: string; plays: number }>("soundtrack artists", (db) =>
      db`SELECT mode() WITHIN GROUP (ORDER BY a.name) AS name, count(*)::int AS plays
         FROM scrobbles s JOIN unnest(${froms}::bigint[], ${tos}::bigint[]) AS w(f, t) ON s.uts >= w.f AND s.uts < w.t,
              unnest(coalesce(s.artist_keys, ARRAY[lower(s.artist)]), coalesce(s.artists, ARRAY[s.artist])) AS a(k, name)
         GROUP BY a.k ORDER BY plays DESC, max(s.uts) DESC LIMIT 5`,
    ),
  ]);
  return { ...base, plays: count?.[0]?.n ?? 0, tracks: tracks ?? [], artists: artists ?? [] };
}
