import "server-only";
import { createHash } from "node:crypto";
import { q } from "@/lib/db";
import { parseCredit } from "@/lib/history/credits";

/**
 * "Onkar played your song": has a song someone sent me turned up in what I
 * actually listened to since? Matched the same way the history matches songs
 * (versions and credit order don't matter), counting only plays after it
 * was sent.
 */
export interface Played {
  n: number;
  first: string;
}

/** The sender's browser keeps a random code; only a scrambled copy is stored. */
export const senderHash = (token: string) =>
  createHash("sha256").update(`${process.env.HASH_SALT ?? ""}|sender|${token}`).digest("base64url").slice(0, 32);

export async function playedSince(songs: { id: number; track: string; artist: string; at: string }[]): Promise<Map<number, Played>> {
  const out = new Map<number, Played>();
  if (!songs.length) return out;
  const keyed = songs.map((s) => ({ ...s, key: parseCredit(s.track, s.artist).songKey, after: Math.floor(Date.parse(s.at) / 1000) }));
  const rows = await q<{ song_key: string; uts: string }>("played since", (db) =>
    db`SELECT song_key, uts FROM scrobbles
       WHERE song_key = ANY(${[...new Set(keyed.map((k) => k.key))]}::text[]) AND uts > ${Math.min(...keyed.map((k) => k.after))}
       ORDER BY uts`,
  );
  for (const k of keyed) {
    const plays = (rows ?? []).filter((r) => r.song_key === k.key && Number(r.uts) > k.after);
    if (plays.length) out.set(k.id, { n: plays.length, first: new Date(Number(plays[0].uts) * 1000).toISOString() });
  }
  return out;
}
