import { connection } from "next/server";
import { getListeningStats } from "@/lib/presence/lastfm";
import { appleSong } from "@/lib/presence/server";

/** On repeat this month, when I listen, streak and lifetime plays. Changes slowly; cached 10 minutes at the edge. */
export async function GET() {
  await connection();
  const stats = await getListeningStats();
  if (stats) {
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
