import { connection } from "next/server";
import { q } from "@/lib/db";
import { playedSince, senderHash } from "@/lib/talk/played";

/** The songs this browser sent me, and whether I've played them since. */
export async function POST(req: Request) {
  await connection();
  let token = "";
  try {
    token = String(((await req.json()) as { sender?: unknown }).sender ?? "");
  } catch {
    /* empty */
  }
  if (!/^[a-f0-9]{32}$/.test(token)) return Response.json([]);
  const rows = await q<{ id: number; payload: { track: string; artist: string; link: string } | null; created_at: string }>("my songs", (db) =>
    db`SELECT id, payload, created_at FROM submissions WHERE kind = 'song' AND sender = ${senderHash(token)} ORDER BY created_at DESC LIMIT 20`,
  );
  const songs = (rows ?? [])
    .filter((r) => r.payload)
    .map((r) => ({ id: Number(r.id), track: r.payload!.track, artist: r.payload!.artist, link: r.payload!.link, at: new Date(r.created_at).toISOString() }));
  const played = await playedSince(songs);
  return Response.json(
    songs.map((s) => ({ ...s, played: played.get(s.id) ?? null })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
