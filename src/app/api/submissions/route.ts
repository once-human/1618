import { connection } from "next/server";
import { q } from "@/lib/db";
import type { Submission } from "@/lib/presence/types";
import { playedSince } from "@/lib/talk/played";

/** Songs people sent me, or the guestbook: ?kind=song|note */
export async function GET(req: Request) {
  await connection();
  const kind = new URL(req.url).searchParams.get("kind") === "song" ? "song" : "note";
  const rows = await q<{ id: number; kind: "song" | "note"; name: string | null; message: string | null; payload: Submission["song"]; created_at: string }>(
    "submissions",
    (db) =>
      db`SELECT id, kind, name, message, payload, created_at FROM submissions
         WHERE kind = ${kind} AND status = 'live' AND NOT hidden ORDER BY created_at DESC LIMIT 40`,
  );
  const list: Submission[] = (rows ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    message: r.message,
    song: r.payload,
    at: new Date(r.created_at).toISOString(),
  }));
  if (kind === "song") {
    const played = await playedSince(
      list.filter((s) => s.song).map((s) => ({ id: s.id, track: s.song!.track, artist: s.song!.artist, at: s.at })),
    );
    for (const s of list) s.played = played.get(s.id) ?? null;
  }
  return Response.json(list, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } });
}
