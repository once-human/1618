import { allow, q, visitorKey } from "@/lib/db";
import { trackKey } from "@/lib/presence/lastfm";

/** 🔥 for the song that's playing. One per song per visitor every 10 minutes. */
export async function POST(req: Request) {
  let body: { track?: unknown; artist?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const track = typeof body.track === "string" ? body.track.slice(0, 200) : "";
  const artist = typeof body.artist === "string" ? body.artist.slice(0, 200) : "";
  if (!track || !artist) return new Response("Send { track, artist }", { status: 400 });
  const key = trackKey(artist, track);

  if (!(await allow(`fire:${visitorKey(req)}:${key}`, 1, 600))) {
    const rows = await q<{ n: number }>("fire read", (db) => db`SELECT n FROM reactions WHERE track_key = ${key}`);
    return Response.json({ fire: rows?.[0]?.n ?? 0, counted: false }, { status: 429 });
  }
  const rows = await q<{ n: number }>("fire", (db) =>
    db`INSERT INTO reactions (track_key, n) VALUES (${key}, 1)
       ON CONFLICT (track_key) DO UPDATE SET n = reactions.n + 1, updated_at = now() RETURNING n`,
  );
  return Response.json({ fire: rows?.[0]?.n ?? null, counted: true });
}
