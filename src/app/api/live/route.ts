import { createHash } from "node:crypto";
import { after, connection } from "next/server";
import { runSync } from "@/lib/history/sync";
import { getMusic, getPresence } from "@/lib/presence/server";
import { getSaved } from "@/lib/presence/pinterest";
import type { Live } from "@/lib/presence/types";

/**
 * Everything live in one response: presence, music, and a version stamp for
 * Pinterest (fetched separately, and only when it changes). The page polls
 * this every 15 seconds and sends back the last ETag; when nothing changed
 * the answer is an empty 304.
 */
export async function GET(req: Request) {
  await connection();
  // Visits keep the history store fresh (at most every five minutes).
  after(() => runSync().catch(() => null));
  const [presence, tracks, saved] = await Promise.all([getPresence(), getMusic(), getSaved(4).catch(() => null)]);
  const body: Live = {
    presence,
    music: { tracks, fetchedAt: new Date().toISOString() },
    savedVersion: saved?.fetchedAt ?? null,
    fetchedAt: new Date().toISOString(),
  };
  // The ETag ignores the fetch timestamps, so it only changes when the content does.
  const stable = JSON.stringify(body, (k, v) => (k === "fetchedAt" ? undefined : v));
  const etag = `"${createHash("sha1").update(stable).digest("base64url").slice(0, 16)}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return Response.json(body, { headers });
}
