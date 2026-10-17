import { connection } from "next/server";
import { getListeningStats } from "@/lib/presence/lastfm";
import { appleSong } from "@/lib/presence/server";
import { cachedSummary, roundToFive } from "@/lib/history/query";

/**
 * This month in listening. On repeat and the top artist come from the
 * history store when it has the data, so songs are counted across versions
 * and every credited artist gets their plays; Last.fm's own charts are the
 * fallback. Changes slowly; cached 10 minutes at the edge.
 */
export async function GET() {
  await connection();
  const stats = await getListeningStats();
  if (stats) {
    const to = roundToFive(new Date());
    const from = new Date(to.getTime() - 30 * 86400_000);
    const month = await cachedSummary(from.toISOString(), to.toISOString()).catch(() => null);
    if (month?.music.plays) {
      stats.onRepeat = month.music.topTracks.slice(0, 5).map((t) => ({ track: t.track, artist: t.artist, plays: t.plays }));
      stats.topArtists = month.music.topArtists.slice(0, 3);
    }
    // Covers, links and previews for the songs on repeat (each lookup is cached for weeks).
    const apple = await Promise.all(stats.onRepeat.map((t) => appleSong(t.artist, t.track, null, 2).catch(() => null)));
    stats.onRepeat = stats.onRepeat.map((t, i) => ({
      ...t,
      image: apple[i]?.art ?? null,
      url: apple[i]?.link ?? `https://music.apple.com/in/search?term=${encodeURIComponent(`${t.artist} ${t.track}`)}`,
      preview: apple[i]?.preview ?? null,
    }));
  }
  return Response.json(stats, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
