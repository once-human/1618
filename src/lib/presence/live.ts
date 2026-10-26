import "server-only";
import { getMusic, getPresence } from "@/lib/presence/server";
import { getSaved } from "@/lib/presence/pinterest";
import { getListeningStats } from "@/lib/presence/lastfm";
import { appleSong } from "@/lib/presence/server";
import { cachedSummary, roundToFive } from "@/lib/history/query";
import type { ListeningStats, Live } from "@/lib/presence/types";

/** Everything live in one go: presence, music, and Pinterest's version stamp. Served by /api/live and sent with pages. */
export async function getLive(): Promise<Live> {
  const [presence, tracks, saved] = await Promise.all([getPresence(), getMusic(), getSaved(4).catch(() => null)]);
  return {
    presence,
    music: { tracks, fetchedAt: new Date().toISOString() },
    savedVersion: saved?.fetchedAt ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

/** This month's listening, with the store's counts where it has them and Apple covers and links. */
export async function getListening(): Promise<ListeningStats | null> {
  const stats = await getListeningStats();
  if (!stats) return null;
  const to = roundToFive(new Date());
  const from = new Date(to.getTime() - 30 * 86400_000);
  const month = await cachedSummary(from.toISOString(), to.toISOString()).catch(() => null);
  if (month?.music.plays) {
    stats.onRepeat = month.music.topTracks.slice(0, 5).map((t) => ({ track: t.track, artist: t.artist, plays: t.plays }));
    stats.topArtists = month.music.topArtists.slice(0, 3);
  }
  const apple = await Promise.all(stats.onRepeat.map((t) => appleSong(t.artist, t.track, null, 4).catch(() => null)));
  stats.onRepeat = stats.onRepeat.map((t, i) => ({
    ...t,
    image: apple[i]?.art ?? null,
    url: apple[i]?.link ?? `https://music.apple.com/in/search?term=${encodeURIComponent(`${t.artist} ${t.track}`)}`,
    preview: apple[i]?.preview ?? null,
  }));
  return stats;
}
