import { connection } from "next/server";
import { getMusic } from "@/lib/presence/server";
import type { Music } from "@/lib/presence/types";

/**
 * What's playing and what played recently. Polled every 15s by the page.
 * The edge keeps a copy for 10s, so Last.fm is asked at most a few times a
 * minute however many people are on the site.
 */
export async function GET() {
  await connection();
  const body: Music = { tracks: await getMusic(), fetchedAt: new Date().toISOString() };
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" },
  });
}
